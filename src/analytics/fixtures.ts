import { KeystrokeRecorder } from "./recorder";
import { codeForChar } from "./layouts";
import type { KeystrokeEvent, MetricsInput } from "./types";

/**
 * Test helpers for building keystroke logs by hand.
 *
 * Every metric is derived from a log, so a log built with known timings and
 * known mistakes is a complete specification of an expected result. These
 * helpers exist so a test reads as "type this, at this speed, with this
 * typo" rather than as forty lines of object literals.
 */

/** Splits a phrase into scoring targets: each word carries its own trailing space. */
export function targetsOf(text: string): string[] {
  const words = text.split(" ");
  return words.map((w, i) => (i === words.length - 1 ? w : `${w} `));
}

export interface TypeScriptStep {
  /** The character produced, or "\b" for a backspace. */
  ch: string;
  /** Milliseconds since the previous step. */
  gap?: number;
  /** Overrides the physical key, for testing synthetic input. */
  code?: string | null;
  synthetic?: boolean;
}

/**
 * Replays a sequence of keystrokes against a target.
 *
 * `perKeyMs` sets a uniform cadence, which makes a run's speed exactly
 * predictable: at 5 chars per word, 100ms per key is precisely 120 WPM.
 */
export function typeSequence(
  targets: readonly string[],
  steps: readonly TypeScriptStep[],
  perKeyMs = 100,
  t0 = 1000,
): { log: KeystrokeEvent[]; durationMs: number } {
  const recorder = new KeystrokeRecorder(targets, t0);
  let t = t0;

  for (const step of steps) {
    t += step.gap ?? perKeyMs;
    if (step.ch === "\b") {
      recorder.backspace({ t });
      continue;
    }
    recorder.insert(step.ch, {
      t,
      code: step.code === undefined ? codeForChar(step.ch) : step.code,
      synthetic: step.synthetic,
    });
  }

  return { log: [...recorder.log], durationMs: t - t0 };
}

/** Types `text` perfectly against `targets` at a fixed cadence. */
export function typePerfectly(
  targets: readonly string[],
  perKeyMs = 100,
  t0 = 1000,
): { log: KeystrokeEvent[]; durationMs: number } {
  const steps = targets.join("").split("").map((ch) => ({ ch }));
  return typeSequence(targets, steps, perKeyMs, t0);
}

export function inputFor(
  targets: readonly string[],
  durationMs: number,
  overrides: Partial<MetricsInput> = {},
): MetricsInput {
  return {
    targets,
    durationMs,
    pausedMs: 0,
    charsPerWord: 5,
    layoutId: "qwerty",
    ...overrides,
  };
}
