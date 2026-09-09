import { KeystrokeRecorder } from "@/analytics/recorder";
import { computeMetrics } from "@/analytics/metrics";
import type { TypingMetrics } from "@/analytics/types";
import { CHARS_PER_WORD, type WpmUnit } from "@/data/types";
import { getCorpus } from "@/data";
import { addRelic, draftRelics, makeEffectApi, RelicRuntime } from "./relics/runtime";
import {
  active,
  applyChar as applyAscentChar,
  clearPlatform,
  jumpProgress,
  refill,
  type Platform,
} from "./modes/ascent";
import { bandTheme, PLATFORMS_PER_BAND } from "@/data/bands";
import { createContext, createState, refreshStats, type RunConfig } from "./state";
import { DT, MAX_FRAME_MS, MAX_STEPS, STALL_MS, step } from "./step";
import type { EngineContext, EngineEvent, GameState } from "./types";

/**
 * The snapshot React sees.
 *
 * Immutable, and republished at roughly 10Hz — and only when something a HUD
 * actually displays has changed. Anything that needs to move smoothly (a
 * combo bar draining, a shield charging) is written to a CSS custom property
 * by the render loop instead, never routed through React.
 */
export interface HudSnapshot {
  readonly phase: GameState["phase"];
  readonly mode: GameState["mode"];

  // ---- Ascent ----------------------------------------------------------
  readonly height: number;
  readonly band: number;
  readonly bandName: string;
  /** Platforms into the current band, for the band progress readout. */
  readonly bandProgress: number;
  readonly shields: number;
  readonly maxShields: number;
  /** Distance to the flood, 0..1 of the maximum. What "how much trouble" looks like. */
  readonly gap: number;
  readonly combo: number;
  readonly comboBest: number;
  readonly score: number;
  /** 0..1 across the active word. Drives the climber's crouch. */
  readonly charge: number;
  readonly climberPhase: string;
  /** 0..1 through the current leap. */
  readonly jump: number;
  /** The visible platforms, active first. */
  readonly platforms: readonly Platform[];
  /** Set when the player has missed the same character enough to need help. */
  readonly hintChar: string | null;

  // ---- shared ----------------------------------------------------------
  readonly wpm: number;
  readonly accuracy: number;
  readonly relicIds: readonly string[];
  readonly draft: readonly string[] | null;

  readonly rev: number;
}

export interface RunResult {
  id: string;
  mode: GameState["mode"];
  seed: string;
  corpusId: string;
  startedAt: number;
  metrics: TypingMetrics;
  ascent?: {
    height: number;
    band: number;
    score: number;
    comboBest: number;
    relics: string[];
  };
  layoutId: string;
}

export interface EngineOptions extends RunConfig {
  layoutId?: string;
  onEvent?: (event: EngineEvent) => void;
}

const HUD_INTERVAL_MS = 100;

export class GameEngine {
  readonly state: GameState;
  readonly config: RunConfig;

  private ctx: EngineContext;
  private runtime = new RelicRuntime();
  private recorder: KeystrokeRecorder;
  private listeners = new Set<() => void>();
  private snapshot: HudSnapshot;
  private rev = 0;
  private hudAccumulator = 0;
  private accumulator = 0;
  private layoutId: string;
  private onEvent?: (event: EngineEvent) => void;

  /** Landing and error bursts drained by the particle layer each frame. */
  private bursts: { kind: string; strength: number }[] = [];

  private startedAtWall = 0;
  private startedAtPerf: number | null = null;
  private endedAtPerf: number | null = null;
  private wpmUnit: WpmUnit;
  /** Set when the current word has had a mistake, so "perfect" is knowable. */
  private wordDirty = false;
  /** The character the player keeps missing, once they have missed it enough. */
  private hintChar: string | null = null;
  /** Previous combo and shield counts, so a change can be emitted as an event. */
  private lastCombo = 0;
  private lastShields = 0;
  /** Sprint and Zen word counters, for the readout. */
  private invalidReasons = new Set<string>();

  constructor(options: EngineOptions) {
    this.config = options;
    this.layoutId = options.layoutId ?? "qwerty";
    this.onEvent = options.onEvent;

    this.state = createState(options);
    this.ctx = createContext(options);

    const corpus = getCorpus(options.corpusId);
    this.wpmUnit = corpus.wpmUnit;

    refreshStats(this.state, this.runtime);
    this.state.ascent.shields = this.state.stats.maxShields;
    refill(this.state.ascent, this.ascentCtx());

    this.recorder = new KeystrokeRecorder([], 0);
    this.targets = [];
    this.snapshot = this.buildSnapshot();
  }

  /**
   * The target text, one entry per platform.
   *
   * Grown by the climb rather than built up front: the words above the
   * climber are chosen a couple of platforms ahead, so there is no fixed list
   * to build when a run starts. It begins empty and is extended as platforms
   * are drawn, which is also why the platform index maps straight onto it and
   * the analytics need no padding.
   */
  private targets: string[];

  // ---- subscription -----------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HudSnapshot => this.snapshot;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): HudSnapshot {
    const s = this.state;
    const metrics = this.liveMetrics();
    const ascent = s.ascent;

    return {
      phase: s.phase,
      mode: s.mode,

      height: ascent.height,
      band: ascent.band,
      bandName: bandTheme(ascent.band).name,
      bandProgress: ascent.height % PLATFORMS_PER_BAND,
      shields: ascent.shields,
      maxShields: s.stats.maxShields,
      gap: ascent.gap / s.stats.gapMax,
      combo: ascent.combo,
      comboBest: ascent.comboBest,
      score: ascent.score,
      charge: ascent.charge,
      climberPhase: ascent.phase,
      jump: jumpProgress(ascent),
      platforms: ascent.visible,
      hintChar: this.hintChar,

      wpm: metrics.wpm,
      accuracy: metrics.accuracy,
      relicIds: s.relics.map((r) => r.id),
      draft: s.draft,

      rev: this.rev,
    };
  }

  /**
   * Cheap live speed and accuracy for the HUD.
   *
   * Deliberately not `computeMetrics`: that walks the whole log and is meant
   * to run once, at the end. Running it ten times a second would put an O(n)
   * pass on the critical path of a game loop.
   *
   * The figure is cumulative over the run, which is right for this game even
   * though the game is untimed. An untimed PRACTICE mode needs a trailing
   * typing rate instead, because a cumulative average decays toward zero the
   * moment someone stops to think, and that punishes exactly the pausing such
   * a mode exists to allow -- a trailing wall-clock window fails the same way,
   * since after two minutes of thinking the last thirty seconds are empty.
   * Here there is no such pausing to protect: the flood rises the whole time,
   * so idle seconds genuinely cost you and the average over the run is the
   * honest number.
   */
  private liveMetrics(): { wpm: number; accuracy: number } {
    const elapsed = this.elapsedMs();
    if (elapsed <= 0) return { wpm: 0, accuracy: 100 };

    const log = this.recorder.log;
    if (log.length === 0) return { wpm: 0, accuracy: 100 };

    const charsPerWord = CHARS_PER_WORD[this.wpmUnit];

    let correct = 0;
    let firstPresses = 0;
    let firstCorrect = 0;

    for (const k of log) {
      if (k.kind !== "insert") continue;
      if (k.correct) correct++;
      if (k.firstPress) {
        firstPresses++;
        if (k.correct) firstCorrect++;
      }
    }

    const accuracy = firstPresses === 0 ? 100 : (firstCorrect / firstPresses) * 100;

    const wpm = correct / charsPerWord / (elapsed / 60_000);
    return { wpm: Number.isFinite(wpm) ? wpm : 0, accuracy };
  }

  private elapsedMs(): number {
    if (this.startedAtPerf === null) return 0;
    const end = this.endedAtPerf ?? this.nowRef;
    return Math.max(0, end - this.startedAtPerf - this.recorder.pausedMs);
  }

  /** Last timestamp the loop saw; avoids calling performance.now() here. */
  private nowRef = 0;


  // ---- lifecycle --------------------------------------------------------


  start(now: number): void {
    if (this.state.phase === "running") return;
    this.state.phase = "running";
    this.startedAtWall = Date.now();
    this.startedAtPerf = now;
    this.nowRef = now;
    this.recorder.start(now);
    this.emit({ type: "bandStart", band: this.state.ascent.band });
    this.publish(true);
  }

  pause(now: number): void {
    if (this.state.phase !== "running") return;
    this.state.phase = "paused";
    this.pausedAt = now;
    this.publish(true);
  }

  private pausedAt = 0;

  resume(now: number): void {
    if (this.state.phase !== "paused") return;
    if (this.pausedAt > 0) {
      const delta = now - this.pausedAt;
      this.recorder.pausedMs += delta;
      this.state.pausedMs += delta;
    }
    this.pausedAt = 0;
    this.state.phase = "running";
    this.accumulator = 0;
    this.publish(true);
  }

  finish(now: number): void {
    if (this.state.phase === "over") return;
    this.endedAtPerf = now;
    this.state.phase = "over";
    this.emit({
      type: "gameOver",
      score: this.state.ascent.score,
      height: this.state.ascent.height,
    });
    this.publish(true);
  }

  markInvalid(reason: string): void {
    this.invalidReasons.add(reason);
  }

  /**
   * Replaces the event handler.
   *
   * Exposed so React can attach its handler in an effect rather than passing
   * one through a ref: a ref written or read during render is a correctness
   * hazard under concurrent rendering, and the engine is perfectly capable of
   * owning this itself.
   */
  setEventHandler(handler: ((event: EngineEvent) => void) | undefined): void {
    this.onEvent = handler;
  }

  // ---- the loop ---------------------------------------------------------

  /**
   * Advances the simulation by one rendered frame's worth of time.
   *
   * Returns the interpolation alpha the renderer should use between each
   * entity's `prev` and current position.
   */
  advance(now: number, frameMs: number): number {
    this.nowRef = now;

    if (this.state.phase === "paused" || this.state.phase === "draft") return 0;

    // A gap this large means the tab was hidden, the process was suspended,
    // or a GC pause ran long. Fast-forwarding would teleport transmissions
    // into the player, so pause instead and let them resume deliberately.
    if (frameMs > STALL_MS) {
      if (this.state.phase === "running") this.pause(now);
      this.accumulator = 0;
      return 0;
    }

    let dt = Math.min(frameMs, MAX_FRAME_MS);

    if (this.state.phase === "running") {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS) {
        step(this.state, this.ctx, this.runtime, this.emit, DT);
        this.accumulator -= DT;
        steps++;
        if (this.state.phase !== "running") break;
      }
      // Abandon the remaining debt rather than compounding it into a spiral
      // where each frame owes more than the last.
      if (steps === MAX_STEPS) this.accumulator = 0;
    }

    this.hudAccumulator += dt;
    if (this.hudAccumulator >= HUD_INTERVAL_MS) {
      this.hudAccumulator = 0;
      this.publish(false);
    }

    dt = 0;
    return this.accumulator / DT;
  }

  private publish(force: boolean): void {
    const next = this.buildSnapshot();
    if (!force && !hudChanged(this.snapshot, next)) return;
    this.rev++;
    this.snapshot = { ...next, rev: this.rev };
    this.notify();
  }

  private emit = (event: EngineEvent): void => {
    const api = makeEffectApi(this.state, this.ctx.rngEffect, this.emit);
    this.runtime.emit(event, api);
    this.onEvent?.(event);
  };

  // ---- input ------------------------------------------------------------

  /**
   * Applies a produced character.
   *
   * Runs synchronously in the input handler. Everything here is O(1) except
   * the lock search, which is bounded by `maxLive`.
   */
  handleChar(char: string, now: number, code: string | null, synthetic = false): void {
    if (this.state.phase === "idle") this.start(now);
    if (this.state.phase !== "running") return;
    this.nowRef = now;

    this.handleAscentChar(char, now, code, synthetic);
    this.publish(true);
  }

  /**
   * Applies a produced character to the climb.
   *
   * Recorded against the platform index, which is dense from zero — so it
   * maps straight onto the target list the analytics layer wants, with none
   * of the sparse-array padding the radar mode needed. That is also why
   * Ascent can feed career statistics where the radar could not: one word at
   * a time means the expected character is never ambiguous.
   */
  private handleAscentChar(
    char: string,
    now: number,
    code: string | null,
    synthetic: boolean,
  ): void {
    const ascent = this.state.ascent;
    if (!ascent) return;

    const platform = active(ascent);
    if (!platform) return;

    const charIndex = platform.typed;
    const expected = platform.word[charIndex] ?? null;

    // Recorded before the outcome is applied, so the expected character is
    // the one that was actually being asked for.
    this.recorder.insertAt(platform.index, charIndex, expected, char, {
      t: now,
      code,
      synthetic,
    });

    // The targets array grows alongside the platforms, so the metrics layer
    // sees exactly the words that were asked for.
    while (this.targets.length <= platform.index) {
      this.targets.push(
        ascent.visible.find((p) => p.index === this.targets.length)?.word ?? "",
      );
    }
    this.targets[platform.index] = platform.word;

    const outcome = applyAscentChar(ascent, this.ascentCtx(), char, now);

    switch (outcome.kind) {
      case "progress":
        this.hintChar = null;
        this.emit({ type: "keystroke", correct: true });
        this.emit({ type: "progress", word: platform.word, typed: platform.typed });
        break;

      case "cleared": {
        this.hintChar = null;
        this.emit({ type: "keystroke", correct: true });

        const word = platform.word;
        const before = ascent.shields;
        const result = clearPlatform(ascent, this.ascentCtx(), outcome.perfect);

        this.emit({ type: "cleared", word, perfect: outcome.perfect, height: ascent.height });
        if (ascent.shields > before) {
          this.emit({ type: "shieldGained", total: ascent.shields });
        }
        if (result.bandChanged) {
          refreshStats(this.state, this.runtime);
          this.emit({ type: "bandStart", band: ascent.band });
          // A band boundary is where the draft happens. It is a phase rather
          // than a modal so the loop can hold the world still behind it.
          this.state.phase = "draft";
        }
        break;
      }

      case "error": {
        this.hintChar = outcome.hint ? outcome.expected : null;
        this.emit({ type: "keystroke", correct: false });
        this.emit({
          type: "mistype",
          expected: outcome.expected,
          actual: char,
          charged: outcome.charged,
          hint: outcome.hint,
        });
        if (outcome.charged) {
          if (ascent.combo === 0 && this.lastCombo > 0) {
            this.emit({ type: "comboBreak", at: this.lastCombo });
          }
          if (ascent.shields < this.lastShields) {
            this.emit({ type: "shieldLost", remaining: ascent.shields });
          }
        }
        break;
      }

      case "skipped":
        // The softlock escape fired. The player is told, because silently
        // handing them a character they could not type would be baffling.
        this.hintChar = null;
        this.emit({ type: "skipped", expected: outcome.expected });
        break;

      case "ignored":
        break;
    }

    this.lastCombo = ascent.combo;
    this.lastShields = ascent.shields;
  }

  /** The context the ascent core draws words through. */
  private ascentCtx() {
    return {
      drawWord: (band: number, index: number) =>
        this.ctx.drawWord(band, index, this.state.stats.lengthBias),
      rng: this.ctx.rngSpawn,
    };
  }

  // ---- draft ------------------------------------------------------------

  openDraft(): void {
    if (this.state.phase !== "draft") return;
    this.state.draft = draftRelics(this.state.relics, this.state.ascent.band, this.ctx.rngDraft);
    if (this.state.draft.length === 0) {
      // Nothing left to offer: skip the draft rather than showing an empty one.
      this.resumeFromDraft();
      return;
    }
    this.publish(true);
  }

  pickRelic(id: string): void {
    if (this.state.phase !== "draft") return;
    if (!this.state.draft?.includes(id)) return;
    addRelic(this.state.relics, id);
    refreshStats(this.state, this.runtime);
    this.resumeFromDraft();
  }

  skipDraft(): void {
    if (this.state.phase !== "draft") return;
    this.resumeFromDraft();
  }

  private resumeFromDraft(): void {
    this.state.draft = null;
    this.state.phase = "running";
    this.accumulator = 0;
    this.emit({ type: "bandStart", band: this.state.ascent.band });
    this.publish(true);
  }

  // ---- output -----------------------------------------------------------

  drainBursts(): { kind: string; strength: number }[] {
    if (this.bursts.length === 0) return [];
    const out = this.bursts;
    this.bursts = [];
    return out;
  }

  /** The visible platforms, active first. */
  get platforms(): readonly Platform[] {
    return this.state.ascent.visible;
  }

  /** Builds the full result. Called once, when the run ends. */
  result(): RunResult {
    const metrics = computeMetrics(this.recorder.log, {
      // Ascent's platform indices are dense, so the target list it built as
      // it climbed is already exactly what the metrics layer wants. The radar
      // mode needed a sparse-array padding hack here; that is now gone.
      targets: this.targets,
      durationMs: this.elapsedMs(),
      pausedMs: this.recorder.pausedMs,
      charsPerWord: CHARS_PER_WORD[this.wpmUnit],
      layoutId: this.layoutId,
      invalidReasons: [...this.invalidReasons],
    });

    return {
      id: `${this.startedAtWall.toString(36)}-${this.config.seed}`,
      mode: this.state.mode,
      seed: this.config.seed,
      corpusId: this.config.corpusId,
      startedAt: this.startedAtWall,
      metrics,
      layoutId: this.layoutId,
      ...(this.state.ascent
        ? {
            ascent: {
              height: this.state.ascent.height,
              band: this.state.ascent.band,
              score: this.state.ascent.score,
              comboBest: this.state.ascent.comboBest,
              relics: this.state.relics.map((r) => r.id),
            },
          }
        : {}),
    };
  }

  get keystrokeLog() {
    return this.recorder.log;
  }
}

/** Compares only the fields a HUD renders, so a stable HUD costs no renders. */
/** Compares only the fields a HUD renders, so a stable HUD costs no renders. */
function hudChanged(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase !== b.phase ||
    a.height !== b.height ||
    a.band !== b.band ||
    a.shields !== b.shields ||
    a.maxShields !== b.maxShields ||
    a.combo !== b.combo ||
    a.score !== b.score ||
    a.hintChar !== b.hintChar ||
    a.draft !== b.draft ||
    a.relicIds.length !== b.relicIds.length ||
    // The crouch and the leap are written straight to CSS custom properties
    // by the render loop, so they are quantised hard here -- React never
    // needs to see them at animation resolution.
    Math.round(a.charge * 8) !== Math.round(b.charge * 8) ||
    Math.round(a.gap * 40) !== Math.round(b.gap * 40) ||
    Math.round(a.wpm) !== Math.round(b.wpm) ||
    Math.round(a.accuracy * 10) !== Math.round(b.accuracy * 10) ||
    a.platforms[0]?.index !== b.platforms[0]?.index ||
    a.platforms[0]?.typed !== b.platforms[0]?.typed
  );
}
