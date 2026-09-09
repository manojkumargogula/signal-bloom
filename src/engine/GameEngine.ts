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

  // ---- Sprint and Zen --------------------------------------------------
  readonly targets: readonly string[];
  readonly wordIndex: number;
  readonly charIndex: number;
  readonly typedWords: readonly (readonly string[])[];
  readonly timeLeftMs: number | null;

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

const EMPTY_PLATFORMS: readonly Platform[] = [];

/**
 * How much recent typing Zen's live speed is measured over. Long enough to
 * read steadily, short enough to reflect what the player is doing now.
 */
const ZEN_WINDOW_MS = 30_000;

/**
 * Gaps longer than this are thinking, not typing, and are excluded from the
 * live rate. Matches the outlier threshold the analytics layer uses for
 * per-key latency, so the two agree about what counts as a keystroke.
 */
const LIVE_GAP_LIMIT_MS = 1500;

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
  private wordsDone = 0;
  private perfectWords = 0;
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
    if (this.state.ascent) {
      this.state.ascent.shields = this.state.stats.maxShields;
      refill(this.state.ascent, this.ascentCtx());
    }

    const targets = this.buildTargets();
    this.recorder = new KeystrokeRecorder(targets, 0);
    this.targets = targets;
    this.snapshot = this.buildSnapshot();
  }

  private targets: string[];

  /**
   * Builds the target text for the timed modes.
   *
   * Each word carries its own trailing space, which makes the separator a
   * normally scored character instead of a special case threaded through
   * every formula.
   */
  private buildTargets(): string[] {
    // Ascent builds its targets as it climbs, one per platform, so there is
    // no fixed list up front.
    if (this.state.mode === "ascent") return [];

    const corpus = getCorpus(this.config.corpusId);

    if (corpus.kind === "quotes" && corpus.quotes?.length) {
      const quote = this.ctx.rngWords.pick(corpus.quotes);
      const words = quote.text.split(" ");
      return words.map((w, i) => (i === words.length - 1 ? w : `${w} `));
    }

    // A duration-based run needs enough words that a fast typist cannot run
    // out; 220 WPM for two minutes is comfortably over any real result.
    const need =
      this.config.wordCount ??
      Math.max(60, Math.ceil(((this.config.durationMs ?? 30_000) / 60_000) * 220));

    const words: string[] = [];
    for (let i = 0; i < need; i++) words.push(this.ctx.drawWord(9, i + 3, 0));
    return words.map((w, i) => (i === need - 1 ? w : `${w} `));
  }

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
    // One pass over the log rebuilds what was typed in every word. At 10Hz
    // over a few thousand keystrokes this is far cheaper than the alternative
    // of keeping a parallel mutable copy in sync with the recorder.
    const typedWords: string[][] = [];
    for (const k of this.recorder.log) {
      let word = typedWords[k.wordIndex];
      if (!word) {
        word = [];
        typedWords[k.wordIndex] = word;
      }
      if (k.kind === "insert") {
        word.length = k.charIndex;
        word[k.charIndex] = k.actual;
      } else if (k.kind === "backspace") {
        word.length = Math.max(0, word.length - 1);
      } else {
        word.length = 0;
      }
    }

    const ascent = s.ascent;

    return {
      phase: s.phase,
      mode: s.mode,

      height: ascent?.height ?? 0,
      band: ascent?.band ?? 1,
      bandName: bandTheme(ascent?.band ?? 1).name,
      bandProgress: (ascent?.height ?? 0) % PLATFORMS_PER_BAND,
      shields: ascent?.shields ?? 0,
      maxShields: s.stats.maxShields,
      gap: ascent ? ascent.gap / s.stats.gapMax : 1,
      combo: ascent?.combo ?? 0,
      comboBest: ascent?.comboBest ?? 0,
      score: ascent?.score ?? 0,
      charge: ascent?.charge ?? 0,
      climberPhase: ascent?.phase ?? "grounded",
      jump: ascent ? jumpProgress(ascent) : 1,
      platforms: ascent?.visible ?? EMPTY_PLATFORMS,
      hintChar: this.hintChar,

      wpm: metrics.wpm,
      accuracy: metrics.accuracy,
      relicIds: s.relics.map((r) => r.id),
      draft: s.draft,

      targets: this.targets,
      wordIndex: this.recorder.wordIndex,
      charIndex: this.recorder.charIndex,
      typedWords,
      timeLeftMs: this.timeLeftMs(),

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
   * Zen reports the rate at which the player is TYPING, not the rate averaged
   * over the session. Two things were tried before this and both were wrong.
   * A cumulative average decays toward zero the moment someone stops to
   * think, which in an untimed mode punishes exactly the pausing the mode
   * exists to allow. A trailing wall-clock window has the same failure for
   * the same reason -- after two minutes of thinking, the last thirty seconds
   * contain nothing.
   *
   * So Zen sums the intervals between recent keystrokes and drops any gap
   * longer than the analytics layer's outlier threshold, which is the same
   * convention used for per-key latency. A pause makes the figure older, not
   * smaller, and the readout holds the speed the player was actually typing
   * at. The timed modes stay cumulative, because there the average over the
   * whole run IS the result and idle time genuinely costs you.
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

    if (this.state.mode !== "zen") {
      const wpm = correct / charsPerWord / (elapsed / 60_000);
      return { wpm: Number.isFinite(wpm) ? wpm : 0, accuracy };
    }

    // Walk backwards over recent keystrokes, summing only the intervals that
    // represent typing rather than thinking, until enough of them to be
    // steady have been counted.
    let countedMs = 0;
    let countedChars = 0;
    let next: number | null = null;

    for (let i = log.length - 1; i >= 0 && countedMs < ZEN_WINDOW_MS; i--) {
      const k = log[i];
      if (k.kind !== "insert") continue;

      if (next !== null) {
        const gap = next - k.tActive;
        if (gap > 0 && gap <= LIVE_GAP_LIMIT_MS) {
          countedMs += gap;
          if (k.correct) countedChars++;
        }
      }
      next = k.tActive;
    }

    // Under a second of counted typing says nothing yet; fall back to the
    // session average rather than extrapolating from two keystrokes.
    if (countedMs < 1000) {
      const wpm = correct / charsPerWord / (elapsed / 60_000);
      return { wpm: Number.isFinite(wpm) ? wpm : 0, accuracy };
    }

    const wpm = countedChars / charsPerWord / (countedMs / 60_000);
    return { wpm: Number.isFinite(wpm) ? wpm : 0, accuracy };
  }

  private elapsedMs(): number {
    if (this.startedAtPerf === null) return 0;
    const end = this.endedAtPerf ?? this.nowRef;
    return Math.max(0, end - this.startedAtPerf - this.recorder.pausedMs);
  }

  /** Last timestamp the loop saw; avoids calling performance.now() here. */
  private nowRef = 0;

  timeLeftMs(): number | null {
    if (this.state.mode !== "sprint" || !this.config.durationMs) return null;
    if (this.startedAtPerf === null) return this.config.durationMs;
    return Math.max(0, this.config.durationMs - this.elapsedMs());
  }

  // ---- lifecycle --------------------------------------------------------

  /** True when the mode should begin without waiting for a keystroke. */
  get startsImmediately(): boolean {
    return this.state.mode === "ascent";
  }

  start(now: number): void {
    if (this.state.phase === "running") return;
    this.state.phase = "running";
    this.startedAtWall = Date.now();
    this.startedAtPerf = now;
    this.nowRef = now;
    this.recorder.start(now);
    this.emit({ type: "bandStart", band: this.state.ascent?.band ?? 1 });
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
      score: this.state.ascent?.score ?? 0,
      height: this.state.ascent?.height ?? 0,
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

    // Sprint ends on its own clock, independent of the simulation.
    if (this.state.mode === "sprint" && this.config.durationMs) {
      if (this.startedAtPerf !== null && this.elapsedMs() >= this.config.durationMs) {
        this.finish(now);
        return 0;
      }
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

    if (this.state.mode === "ascent") {
      this.handleAscentChar(char, now, code, synthetic);
    } else {
      this.handleTextChar(char, now, code, synthetic);
    }
    this.publish(true);
  }

  private handleTextChar(char: string, now: number, code: string | null, synthetic: boolean): void {
    const before = this.recorder.wordIndex;
    const event = this.recorder.insert(char, { t: now, code, synthetic });

    if (!event.correct) {
      this.wordDirty = true;
      this.emit({
        type: "mistype",
        expected: event.expected ?? "",
        actual: char,
        charged: false,
        hint: false,
      });
    }
    this.emit({ type: "keystroke", correct: event.correct });

    if (this.recorder.wordIndex !== before) {
      this.wordsDone++;
      if (!this.wordDirty) this.perfectWords++;
      this.wordDirty = false;
    }

    // A word-count run finishes when the last target is complete. The final
    // target has no trailing space, so the recorder never advances past it --
    // completion has to be detected from the cursor reaching its end.
    if (this.config.wordCount) {
      const lastIndex = this.targets.length - 1;
      const onLast = this.recorder.wordIndex === lastIndex;
      const finishedLast =
        onLast && this.recorder.charIndex >= (this.targets[lastIndex]?.length ?? 0);
      if (this.recorder.wordIndex > lastIndex || finishedLast) this.finish(now);
    }
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

  handleBackspace(now: number, wordDelete = false): void {
    if (this.state.phase !== "running") return;
    if (this.state.mode === "ascent") return; // a platform word is retried, not edited
    this.nowRef = now;

    const target = this.targets[this.recorder.wordIndex] ?? "";
    const at = this.recorder.charIndex;
    const wasWrong = at > 0 && this.lastCharWasWrong(target, at - 1);

    const event = wordDelete
      ? this.recorder.deleteWord({ t: now })
      : this.recorder.backspace({ t: now });

    // A correction is not an engine event any more: nothing in the climb
    // reacts to one, and Sprint scores it purely through the keystroke log.
    void wasWrong;
    void event;
    this.publish(true);
  }

  private lastCharWasWrong(target: string, index: number): boolean {
    for (let i = this.recorder.log.length - 1; i >= 0; i--) {
      const k = this.recorder.log[i];
      if (k.kind !== "insert") continue;
      if (k.wordIndex === this.recorder.wordIndex && k.charIndex === index) {
        return !k.correct;
      }
    }
    void target;
    return false;
  }

  // ---- draft ------------------------------------------------------------

  openDraft(): void {
    if (this.state.phase !== "draft") return;
    this.state.draft = draftRelics(this.state.relics, this.state.ascent?.band ?? 1, this.ctx.rngDraft);
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
    this.emit({ type: "bandStart", band: this.state.ascent?.band ?? 1 });
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
    return this.state.ascent?.visible ?? EMPTY_PLATFORMS;
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
    a.wordIndex !== b.wordIndex ||
    a.charIndex !== b.charIndex ||
    a.platforms[0]?.index !== b.platforms[0]?.index ||
    a.platforms[0]?.typed !== b.platforms[0]?.typed ||
    Math.floor((a.timeLeftMs ?? 0) / 100) !== Math.floor((b.timeLeftMs ?? 0) / 100)
  );
}
