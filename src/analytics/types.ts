/**
 * The analytics data model.
 *
 * Design rule, and the reason this module has no dependencies: every reported
 * number is DERIVED from the keystroke log at the end of a run, never
 * accumulated live during it. A live counter and a results screen inevitably
 * disagree — usually about accuracy, usually in the player's favour, always
 * embarrassingly. Deriving everything from one immutable log means the results
 * screen cannot drift from what was actually typed, and it means every metric
 * is testable by handing `computeMetrics` a literal array.
 */

export type KeystrokeKind = "insert" | "backspace" | "deleteWord";

/** The ten fingers, left pinky through right pinky. */
export type Finger = "LP" | "LR" | "LM" | "LI" | "LT" | "RT" | "RI" | "RM" | "RR" | "RP";

export interface KeystrokeEvent {
  /** Monotonic index within the run. */
  readonly seq: number;
  /** Raw timestamp, `performance.now()` timebase. */
  readonly t: number;
  /** `t` minus run start minus any paused time before it. The metrics clock. */
  readonly tActive: number;
  readonly kind: KeystrokeKind;
  /** The character the player was supposed to produce; null for deletions. */
  readonly expected: string | null;
  /** What they actually produced. Empty string for deletions. */
  readonly actual: string;
  /**
   * `KeyboardEvent.code` — the PHYSICAL key. Null means the character arrived
   * without one (IME commit, autocorrect, Android Gboard), in which case it
   * still counts toward speed and accuracy but is excluded from latency and
   * from the heatmap, because we do not know which key was pressed.
   *
   * Storing `code` rather than only the character is irreversible: without it
   * a per-key heatmap for a Dvorak or Colemak typist can never be rendered,
   * and it cannot be backfilled for runs already recorded.
   */
  readonly code: string | null;
  readonly correct: boolean;
  /** True when this is the first attempt at this position. */
  readonly firstPress: boolean;
  /** Index into the run's target list. */
  readonly wordIndex: number;
  /** Index within that target. */
  readonly charIndex: number;
  readonly synthetic: boolean;
}

export interface KeyStat {
  attempts: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
  /** Mean interkey interval in ms, or null when there is no clean sample. */
  meanLatency: number | null;
  p50: number | null;
  p90: number | null;
  stdev: number | null;
}

export interface ProblemItem {
  /** The aggregation key: a `code`, a character, or a bigram. */
  key: string;
  /** What to show the player. */
  label: string;
  attempts: number;
  accuracy: number;
  meanLatency: number | null;
  /**
   * Estimated milliseconds lost to this key per attempt, combining excess
   * latency with a confidence-bounded error rate. Expressed in ms so the
   * ranking is interpretable rather than an opaque score.
   */
  costMs: number;
}

export interface SecondSample {
  second: number;
  /** Instantaneous raw speed during this second. */
  raw: number;
  /** Cumulative net speed up to the end of this second. */
  net: number;
  errors: number;
  /** Set when the second is incomplete; excluded from consistency. */
  partial?: true;
}

export interface ErrorEventCounts {
  substitution: number;
  omission: number;
  insertion: number;
  transposition: number;
}

export interface CharCounts {
  /** Every character-producing keystroke, right or wrong. */
  typed: number;
  /** Characters correct in the final text, after corrections. */
  correctFinal: number;
  /** Incorrect first presses. */
  incorrect: number;
  /** Characters typed past the end of a target. */
  extra: number;
  /** Target characters never typed. */
  missed: number;
  /** Positions typed more than once. */
  corrected: number;
}

export interface TypingMetrics {
  /** Net speed: correct final characters. This is the headline number. */
  wpm: number;
  /** Raw speed: everything typed, errors included. */
  rawWpm: number;
  /** 0..100, judged at first press and never healed by backspace. */
  accuracy: number;
  /** 0..100, or null when the run was too short to say anything. */
  consistency: number | null;
  charCounts: CharCounts;
  errorEvents: ErrorEventCounts;
  /** Raw count of wrong keystrokes; a transposition contributes 2. */
  incorrectKeystrokes: number;
  series: SecondSample[];
  byCode: Record<string, KeyStat>;
  byChar: Record<string, KeyStat>;
  byFinger: Record<string, KeyStat>;
  problemKeys: ProblemItem[];
  problemBigrams: ProblemItem[];
  durationMs: number;
  pausedMs: number;
  keystrokes: number;
  valid: boolean;
  invalidReasons: string[];
}

export interface MetricsInput {
  /**
   * The target text, split into units. For Sprint each unit is a word plus its
   * trailing space (except the last), which is what makes the space a real
   * scored character rather than a special case threaded through every
   * formula. For Onslaught each unit is one transmission's word.
   */
  targets: readonly string[];
  /** Active duration in ms, paused time already removed. */
  durationMs: number;
  pausedMs: number;
  /**
   * Characters per standard word. 5 for Latin scripts by convention.
   * Configurable because "5 characters = 1 word" is meaningless for CJK, and
   * retrofitting it would invalidate every stored run.
   */
  charsPerWord: number;
  /** Recorded so a run stays interpretable after the player switches layouts. */
  layoutId: string;
  /** Set when the input was rejected as untrustworthy, e.g. a paste. */
  invalidReasons?: readonly string[];
}
