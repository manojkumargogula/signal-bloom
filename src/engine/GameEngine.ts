import { KeystrokeRecorder } from "@/analytics/recorder";
import { computeMetrics } from "@/analytics/metrics";
import type { TypingMetrics } from "@/analytics/types";
import { CHARS_PER_WORD, type WpmUnit } from "@/data/types";
import { getCorpus } from "@/data";
import { addRelic, draftRelics, makeEffectApi, RelicRuntime } from "./relics/runtime";
import { createContext, createState, refreshStats, type RunConfig } from "./state";
import { DT, MAX_FRAME_MS, MAX_STEPS, STALL_MS, scoreDecode, step } from "./step";
import { applyChar } from "./targeting";
import type { EngineContext, EngineEvent, GameState, Transmission } from "./types";

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
  readonly wave: number;
  readonly waveClockMs: number;
  readonly shields: number;
  readonly maxShields: number;
  readonly combo: number;
  readonly comboBest: number;
  readonly score: number;
  readonly wpm: number;
  readonly accuracy: number;
  readonly decoded: number;
  readonly relicIds: readonly string[];
  readonly draft: readonly string[] | null;
  /** Sprint and Zen: the target text and how far through it the player is. */
  readonly targets: readonly string[];
  readonly wordIndex: number;
  readonly charIndex: number;
  /** What the player has actually typed in the current word, for rendering. */
  readonly typedInWord: readonly string[];
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
  onslaught?: {
    wave: number;
    score: number;
    comboBest: number;
    decoded: number;
    impacted: number;
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

  /** Bursts drained by the particle layer each frame. */
  private bursts: { x: number; y: number; z: number; kind: string }[] = [];

  private startedAtWall = 0;
  private startedAtPerf = 0;
  private endedAtPerf: number | null = null;
  private wpmUnit: WpmUnit;
  /** Set when the current word has had a mistake, so "perfect" is knowable. */
  private wordDirty = false;
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
    this.state.shields = this.state.stats.maxShields;

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
    if (this.state.mode === "onslaught") return [];

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
    for (let i = 0; i < need; i++) words.push(this.ctx.drawWord(0));
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
    const target = this.targets[this.recorder.wordIndex] ?? "";
    const typedInWord: string[] = [];
    for (const k of this.recorder.log) {
      if (k.wordIndex !== this.recorder.wordIndex) continue;
      if (k.kind === "insert") typedInWord[k.charIndex] = k.actual;
      else if (k.kind === "backspace") typedInWord.length = Math.max(0, typedInWord.length - 1);
      else typedInWord.length = 0;
    }
    void target;

    return {
      phase: s.phase,
      mode: s.mode,
      wave: s.wave,
      waveClockMs: Math.max(0, s.waveClock),
      shields: s.shields,
      maxShields: s.stats.maxShields,
      combo: s.combo,
      comboBest: s.comboBest,
      score: s.score,
      wpm: metrics.wpm,
      accuracy: metrics.accuracy,
      decoded: s.decoded,
      relicIds: s.relics.map((r) => r.id),
      draft: s.draft,
      targets: this.targets,
      wordIndex: this.recorder.wordIndex,
      charIndex: this.recorder.charIndex,
      typedInWord,
      timeLeftMs: this.timeLeftMs(),
      rev: this.rev,
    };
  }

  /**
   * Cheap live speed and accuracy for the HUD.
   *
   * Deliberately not `computeMetrics`: that walks the whole log and is meant
   * to run once, at the end. Running it ten times a second would put an
   * O(n) pass on the critical path of a game loop.
   */
  private liveMetrics(): { wpm: number; accuracy: number } {
    const elapsed = this.elapsedMs();
    if (elapsed <= 0) return { wpm: 0, accuracy: 100 };

    let correct = 0;
    let firstPresses = 0;
    let firstCorrect = 0;

    for (const k of this.recorder.log) {
      if (k.kind !== "insert") continue;
      if (k.correct) correct++;
      if (k.firstPress) {
        firstPresses++;
        if (k.correct) firstCorrect++;
      }
    }

    const charsPerWord = CHARS_PER_WORD[this.wpmUnit];
    const minutes = elapsed / 60_000;
    return {
      wpm: minutes > 0 ? correct / charsPerWord / minutes : 0,
      accuracy: firstPresses === 0 ? 100 : (firstCorrect / firstPresses) * 100,
    };
  }

  private elapsedMs(): number {
    if (this.startedAtPerf === 0) return 0;
    const end = this.endedAtPerf ?? this.nowRef;
    return Math.max(0, end - this.startedAtPerf - this.recorder.pausedMs);
  }

  /** Last timestamp the loop saw; avoids calling performance.now() here. */
  private nowRef = 0;

  timeLeftMs(): number | null {
    if (this.state.mode !== "sprint" || !this.config.durationMs) return null;
    if (this.startedAtPerf === 0) return this.config.durationMs;
    return Math.max(0, this.config.durationMs - this.elapsedMs());
  }

  // ---- lifecycle --------------------------------------------------------

  start(now: number): void {
    if (this.state.phase === "running") return;
    this.state.phase = "running";
    this.startedAtWall = Date.now();
    this.startedAtPerf = now;
    this.nowRef = now;
    this.recorder.start(now);
    this.emit({ type: "waveStart", wave: this.state.wave });
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
    this.emit({ type: "gameOver", score: this.state.score, wave: this.state.wave });
    this.publish(true);
  }

  markInvalid(reason: string): void {
    this.invalidReasons.add(reason);
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
      if (this.startedAtPerf > 0 && this.elapsedMs() >= this.config.durationMs) {
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

    if (this.state.mode === "onslaught") {
      this.handleOnslaughtChar(char, now, code, synthetic);
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
        entityId: null,
        expected: event.expected ?? "",
        actual: char,
      });
    }
    this.emit({ type: "keystroke", correct: event.correct, entityId: null });

    if (this.recorder.wordIndex !== before) {
      this.state.decoded++;
      if (!this.wordDirty) this.state.perfect++;
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

  private handleOnslaughtChar(
    char: string,
    now: number,
    code: string | null,
    synthetic: boolean,
  ): void {
    const outcome = applyChar(this.state, char);
    const entity = outcome.entity;

    // Onslaught records against the entity's own word, since the player
    // chooses which transmission to answer rather than moving through one
    // body of text.
    const charIndex = entity ? Math.max(0, entity.typed - 1) : 0;
    const wordIndex = entity ? entity.id : -1;

    if (outcome.kind === "mistype") {
      this.recorder.insertAt(wordIndex, charIndex + 1, outcome.expected, char, {
        t: now,
        code,
        synthetic,
      });
      this.wordDirty = true;
      if (this.state.combo > 0) {
        const at = this.state.combo;
        this.state.combo = 0;
        this.state.comboIdleMs = 0;
        this.emit({ type: "comboBreak", at });
      }
      this.emit({
        type: "mistype",
        entityId: entity?.id ?? null,
        expected: outcome.expected ?? "",
        actual: char,
      });
      this.emit({ type: "keystroke", correct: false, entityId: entity?.id ?? null });
      return;
    }

    if (outcome.kind === "ignored" || !entity) return;

    this.recorder.insertAt(wordIndex, charIndex, outcome.expected, char, {
      t: now,
      code,
      synthetic,
    });
    this.emit({ type: "keystroke", correct: true, entityId: entity.id });

    if (outcome.kind === "lock") {
      this.emit({ type: "lock", entity });
      return;
    }

    if (outcome.kind === "decode") {
      const perfect = !this.wordDirty;
      const ms = this.state.simTime - entity.spawnedAt;

      entity.status = "decoded";
      this.state.decoded++;
      if (perfect) this.state.perfect++;
      this.state.activeId = null;
      this.state.comboIdleMs = 0;

      this.state.score += scoreDecode(this.state, entity.word.length, perfect);
      this.state.combo = Math.min(this.state.combo + 1, this.state.stats.comboCap);
      this.state.comboBest = Math.max(this.state.comboBest, this.state.combo);

      this.bursts.push({ x: entity.x, y: entity.y, z: entity.z, kind: entity.kind });
      this.emit({ type: "decoded", entity, perfect, ms });
      this.wordDirty = false;
    }
  }

  handleBackspace(now: number, wordDelete = false): void {
    if (this.state.phase !== "running") return;
    if (this.state.mode === "onslaught") return; // no backspace on the field
    this.nowRef = now;

    const target = this.targets[this.recorder.wordIndex] ?? "";
    const at = this.recorder.charIndex;
    const wasWrong = at > 0 && this.lastCharWasWrong(target, at - 1);

    const event = wordDelete
      ? this.recorder.deleteWord({ t: now })
      : this.recorder.backspace({ t: now });

    if (event && wasWrong) this.emit({ type: "correction", entityId: null });
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
    this.state.draft = draftRelics(this.state.relics, this.state.wave, this.ctx.rngDraft);
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
    this.state.waveClock = this.state.stats.waveDurationMs;
    this.accumulator = 0;
    this.emit({ type: "waveStart", wave: this.state.wave });
    this.publish(true);
  }

  // ---- output -----------------------------------------------------------

  drainBursts(): { x: number; y: number; z: number; kind: string }[] {
    if (this.bursts.length === 0) return [];
    const out = this.bursts;
    this.bursts = [];
    return out;
  }

  get entities(): readonly Transmission[] {
    return this.state.entities;
  }

  /** Builds the full result. Called once, when the run ends. */
  result(): RunResult {
    const metrics = computeMetrics(this.recorder.log, {
      targets: this.state.mode === "onslaught" ? this.onslaughtTargets() : this.targets,
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
      ...(this.state.mode === "onslaught"
        ? {
            onslaught: {
              wave: this.state.wave,
              score: this.state.score,
              comboBest: this.state.comboBest,
              decoded: this.state.decoded,
              impacted: this.state.impacted,
              relics: this.state.relics.map((r) => r.id),
            },
          }
        : {}),
    };
  }

  /**
   * Reconstructs the target list for an Onslaught run.
   *
   * Keystrokes there are recorded against entity ids rather than positions in
   * a text, so the analytics layer needs a sparse array indexed the same way.
   */
  private onslaughtTargets(): string[] {
    const out: string[] = [];
    for (const k of this.recorder.log) {
      if (k.wordIndex < 0) continue;
      if (out[k.wordIndex] === undefined) out[k.wordIndex] = "";
      if (k.kind === "insert" && k.expected !== null) {
        const existing = out[k.wordIndex];
        if (existing.length <= k.charIndex) {
          out[k.wordIndex] = existing.padEnd(k.charIndex, " ") + k.expected;
        }
      }
    }
    return out;
  }

  get keystrokeLog() {
    return this.recorder.log;
  }
}

/** Compares only the fields a HUD renders, so a stable HUD costs no renders. */
function hudChanged(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase !== b.phase ||
    a.wave !== b.wave ||
    a.shields !== b.shields ||
    a.maxShields !== b.maxShields ||
    a.combo !== b.combo ||
    a.score !== b.score ||
    a.decoded !== b.decoded ||
    Math.round(a.wpm) !== Math.round(b.wpm) ||
    Math.round(a.accuracy * 10) !== Math.round(b.accuracy * 10) ||
    a.wordIndex !== b.wordIndex ||
    a.charIndex !== b.charIndex ||
    a.draft !== b.draft ||
    a.relicIds.length !== b.relicIds.length ||
    Math.floor((a.timeLeftMs ?? 0) / 100) !== Math.floor((b.timeLeftMs ?? 0) / 100) ||
    Math.floor(a.waveClockMs / 250) !== Math.floor(b.waveClockMs / 250)
  );
}
