import { clamp, mean, percentile, stdev, wilsonLower } from "@/lib/math";
import { classifyErrors, countErrorEvents } from "./errors";
import { codeForChar, FINGER_ORDER, getLayout } from "./layouts";
import type {
  CharCounts,
  KeyStat,
  KeystrokeEvent,
  MetricsInput,
  ProblemItem,
  SecondSample,
  TypingMetrics,
} from "./types";

/**
 * Interkey intervals above this are thinking pauses, not motor latency.
 * Including them would rank "the key I happened to pause before" as the
 * player's worst key, which is noise dressed up as insight.
 */
const LATENCY_OUTLIER_MS = 1500;

/** Modelled cost of an error, used to put latency and accuracy on one scale. */
const ERROR_COST_MS = 1000;

const MIN_ATTEMPTS_KEY = 8;
const MIN_ATTEMPTS_BIGRAM = 5;

const emptyStat = (): KeyStat => ({
  attempts: 0,
  correct: 0,
  accuracy: 0,
  meanLatency: null,
  p50: null,
  p90: null,
  stdev: null,
});

interface StatAccumulator {
  attempts: number;
  correct: number;
  latencies: number[];
}

const accumulator = (): StatAccumulator => ({ attempts: 0, correct: 0, latencies: [] });

function finalise(acc: StatAccumulator): KeyStat {
  const sorted = [...acc.latencies].sort((a, b) => a - b);
  return {
    attempts: acc.attempts,
    correct: acc.correct,
    accuracy: acc.attempts === 0 ? 0 : acc.correct / acc.attempts,
    meanLatency: sorted.length ? mean(sorted) : null,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    stdev: sorted.length ? stdev(sorted) : null,
  };
}

function finaliseAll(map: Map<string, StatAccumulator>): Record<string, KeyStat> {
  const out: Record<string, KeyStat> = {};
  for (const [key, acc] of map) out[key] = finalise(acc);
  return out;
}

function bump(
  map: Map<string, StatAccumulator>,
  key: string,
  correct: boolean,
  latency: number | null,
): void {
  let acc = map.get(key);
  if (!acc) {
    acc = accumulator();
    map.set(key, acc);
  }
  acc.attempts++;
  if (correct) acc.correct++;
  if (latency !== null) acc.latencies.push(latency);
}

/**
 * Consistency, as the coefficient of variation of per-second raw speed mapped
 * onto 0..100.
 *
 * The polynomial is the Taylor series of artanh(cv), so for a steady run this
 * is almost exactly 100 * (1 - cv), but it saturates smoothly instead of going
 * negative when someone types in bursts. It also matches the mapping
 * Monkeytype uses, so a score here means the same thing as a score there.
 *
 * Returns null rather than a number when there is not enough signal — claiming
 * 100% consistency for a one-second run would be a bug a player finds in their
 * first session.
 */
export function consistencyFrom(rawSeries: readonly number[]): number | null {
  if (rawSeries.length < 2) return null;
  const mu = mean(rawSeries);
  if (mu === 0) return null;
  const cv = stdev(rawSeries) / mu;
  const mapped = Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5);
  return clamp(100 * (1 - mapped), 0, 100);
}

export function computeMetrics(
  log: readonly KeystrokeEvent[],
  input: MetricsInput,
): TypingMetrics {
  const { targets, durationMs, pausedMs, charsPerWord, layoutId } = input;
  const layout = getLayout(layoutId);
  const invalidReasons = [...(input.invalidReasons ?? [])];

  // ---- replay the edit stream to recover the final text ------------------
  // Character counts have to come from the text as it ended up, not from a
  // running total, so that fixing a typo actually improves net speed.
  const typedByWord = new Map<number, string[]>();
  const lastInsertAt = new Map<string, KeystrokeEvent>();
  const firstPressAt = new Map<string, KeystrokeEvent>();

  for (const k of log) {
    let arr = typedByWord.get(k.wordIndex);
    if (!arr) {
      arr = [];
      typedByWord.set(k.wordIndex, arr);
    }
    if (k.kind === "insert") {
      arr.length = k.charIndex;
      arr[k.charIndex] = k.actual;
      lastInsertAt.set(`${k.wordIndex}:${k.charIndex}`, k);
      if (k.firstPress) firstPressAt.set(`${k.wordIndex}:${k.charIndex}`, k);
    } else if (k.kind === "backspace") {
      arr.length = Math.max(0, arr.length - 1);
    } else {
      arr.length = 0;
    }
  }

  const counts: CharCounts = {
    typed: 0,
    correctFinal: 0,
    incorrect: 0,
    extra: 0,
    missed: 0,
    corrected: 0,
  };

  /** Keystrokes that produced a character still correct in the final text. */
  const creditedSeqs = new Set<number>();

  for (const [wordIndex, arr] of typedByWord) {
    const target = targets[wordIndex] ?? "";
    const shared = Math.min(arr.length, target.length);
    for (let i = 0; i < shared; i++) {
      if (arr[i] === target[i]) {
        counts.correctFinal++;
        const credit = lastInsertAt.get(`${wordIndex}:${i}`);
        if (credit) creditedSeqs.add(credit.seq);
      }
    }
    counts.extra += Math.max(0, arr.length - target.length);
    counts.missed += Math.max(0, target.length - arr.length);
  }

  for (const k of log) {
    if (k.kind !== "insert") continue;
    counts.typed++;
    if (k.firstPress) {
      if (!k.correct) counts.incorrect++;
    } else {
      counts.corrected++;
    }
  }

  // ---- speed and accuracy ------------------------------------------------
  const minutes = durationMs / 60_000;
  const wpm = minutes > 0 ? counts.correctFinal / charsPerWord / minutes : 0;
  const rawWpm = minutes > 0 ? counts.typed / charsPerWord / minutes : 0;

  const firstPresses = log.filter((k) => k.kind === "insert" && k.firstPress);
  const accuracy =
    firstPresses.length === 0
      ? 0
      : (firstPresses.filter((k) => k.correct).length / firstPresses.length) * 100;

  // ---- per-second series -------------------------------------------------
  const binCount = Math.max(1, Math.ceil(durationMs / 1000));
  const rawPerBin = new Array<number>(binCount).fill(0);
  const netPerBin = new Array<number>(binCount).fill(0);
  const errorsPerBin = new Array<number>(binCount).fill(0);

  const binOf = (tActive: number): number =>
    clamp(Math.floor(tActive / 1000), 0, binCount - 1);

  for (const k of log) {
    if (k.kind !== "insert") continue;
    const b = binOf(k.tActive);
    rawPerBin[b]++;
    if (creditedSeqs.has(k.seq)) netPerBin[b]++;
    if (k.firstPress && !k.correct) errorsPerBin[b]++;
  }

  const series: SecondSample[] = [];
  let cumulativeNet = 0;
  for (let i = 0; i < binCount; i++) {
    cumulativeNet += netPerBin[i];
    const binStart = i * 1000;
    const elapsedMs = Math.min((i + 1) * 1000, Math.max(durationMs, 1));
    const elapsedMin = elapsedMs / 60_000;
    const sample: SecondSample = {
      second: i + 1,
      raw: (rawPerBin[i] / charsPerWord) * 60,
      net: elapsedMin > 0 ? cumulativeNet / charsPerWord / elapsedMin : 0,
      errors: errorsPerBin[i],
    };
    // A sliver of a final second produces a wild raw figure; show it on the
    // chart but keep it out of the consistency calculation.
    if (durationMs - binStart < 500) sample.partial = true;
    series.push(sample);
  }

  const consistency = consistencyFrom(
    series.filter((s) => !s.partial).map((s) => s.raw),
  );

  // ---- latency, per key and per finger -----------------------------------
  const byCodeAcc = new Map<string, StatAccumulator>();
  const byCharAcc = new Map<string, StatAccumulator>();
  const byFingerAcc = new Map<string, StatAccumulator>();
  const allLatencies: number[] = [];

  const inserts = log.filter((k) => k.kind === "insert");
  let previous: KeystrokeEvent | null = null;

  for (const k of inserts) {
    // Latency measures the time to PRODUCE this key, so it is attributed to
    // this key and needs a predecessor to measure from.
    let latency: number | null = null;
    if (previous) {
      const delta = k.tActive - previous.tActive;
      if (delta > 0 && delta <= LATENCY_OUTLIER_MS && !k.synthetic) {
        latency = delta;
        allLatencies.push(delta);
      }
    }
    previous = k;

    if (!k.firstPress) continue;

    const expected = k.expected;
    if (expected !== null) bump(byCharAcc, expected, k.correct, latency);

    // The heatmap is keyed by the key the player NEEDED, not the one they
    // hit. Keying by the actual keypress attributes every mistake to the
    // wrong key — press J when K was wanted and you would learn that J is
    // unreliable, when the difficult key is K. On a correct press the two
    // are the same, so `k.code` is authoritative there and also correct for
    // non-QWERTY layouts; on a miss we resolve the expected character
    // through the layout's reverse map.
    const wantedCode = k.correct
      ? k.code
      : expected !== null
        ? (codeForChar(expected) ?? null)
        : null;

    if (wantedCode) {
      bump(byCodeAcc, wantedCode, k.correct, latency);
      const finger = layout.fingerMap[wantedCode];
      if (finger) bump(byFingerAcc, finger, k.correct, latency);
    }
  }

  const byCode = finaliseAll(byCodeAcc);
  const byChar = finaliseAll(byCharAcc);
  const byFinger: Record<string, KeyStat> = {};
  for (const finger of FINGER_ORDER) {
    byFinger[finger] = byFingerAcc.has(finger)
      ? finalise(byFingerAcc.get(finger) as StatAccumulator)
      : emptyStat();
  }

  const medianLatency =
    percentile([...allLatencies].sort((a, b) => a - b), 50) ?? 0;

  // ---- problem keys ------------------------------------------------------
  // Ranked by estimated milliseconds lost per attempt, so the output reads as
  // "this key costs you 84ms" rather than as an opaque severity score.
  const labelForCode = new Map<string, string>();
  for (const row of layout.rows) for (const key of row) labelForCode.set(key.code, key.label);

  const problemKeys: ProblemItem[] = Object.entries(byCode)
    .filter(([, stat]) => stat.attempts >= MIN_ATTEMPTS_KEY)
    .map(([code, stat]) => {
      const errorRate = wilsonLower(stat.attempts - stat.correct, stat.attempts);
      const excess = stat.meanLatency === null ? 0 : stat.meanLatency - medianLatency;
      return {
        key: code,
        label: labelForCode.get(code) ?? code,
        attempts: stat.attempts,
        accuracy: stat.accuracy,
        meanLatency: stat.meanLatency,
        costMs: excess + errorRate * ERROR_COST_MS,
      };
    })
    .filter((item) => item.costMs > 0)
    .sort((a, b) => b.costMs - a.costMs)
    .slice(0, 5);

  // ---- problem bigrams ---------------------------------------------------
  // Bigrams are the highest-signal coaching output: hand alternation and rolls
  // show up here and nowhere else.
  const bigramAcc = new Map<string, StatAccumulator>();
  const latencyBySeq = new Map<number, number>();
  {
    let prev: KeystrokeEvent | null = null;
    for (const k of inserts) {
      if (prev) {
        const delta = k.tActive - prev.tActive;
        if (delta > 0 && delta <= LATENCY_OUTLIER_MS && !k.synthetic) {
          latencyBySeq.set(k.seq, delta);
        }
      }
      prev = k;
    }
  }

  for (const [wordIndex] of typedByWord) {
    const target = targets[wordIndex] ?? "";
    for (let i = 0; i + 1 < target.length; i++) {
      const a = firstPressAt.get(`${wordIndex}:${i}`);
      const b = firstPressAt.get(`${wordIndex}:${i + 1}`);
      if (!a || !b) continue;
      const pair = target[i] + target[i + 1];
      if (pair.includes(" ")) continue; // space-adjacent pairs are their own class
      bump(bigramAcc, pair, a.correct && b.correct, latencyBySeq.get(b.seq) ?? null);
    }
  }

  const problemBigrams: ProblemItem[] = Object.entries(finaliseAll(bigramAcc))
    .filter(([, stat]) => stat.attempts >= MIN_ATTEMPTS_BIGRAM)
    .map(([pair, stat]) => {
      const errorRate = wilsonLower(stat.attempts - stat.correct, stat.attempts);
      const excess = stat.meanLatency === null ? 0 : stat.meanLatency - medianLatency;
      return {
        key: pair,
        label: pair,
        attempts: stat.attempts,
        accuracy: stat.accuracy,
        meanLatency: stat.meanLatency,
        costMs: excess + errorRate * ERROR_COST_MS,
      };
    })
    .filter((item) => item.costMs > 0)
    .sort((a, b) => b.costMs - a.costMs)
    .slice(0, 5);

  // ---- error classes -----------------------------------------------------
  const classified = classifyErrors(log, targets);
  const errorEvents = countErrorEvents(classified);

  // ---- validity ----------------------------------------------------------
  // An invalid run is still shown to the player; it just cannot set a personal
  // best or feed the career aggregate.
  if (counts.typed < 10) invalidReasons.push("too-short");

  let longestGap = 0;
  for (let i = 1; i < inserts.length; i++) {
    longestGap = Math.max(longestGap, inserts[i].tActive - inserts[i - 1].tActive);
  }
  if (longestGap > 10_000) invalidReasons.push("idle-gap");
  if (accuracy < 25 && counts.typed > 100) invalidReasons.push("implausible-accuracy");

  const syntheticFraction =
    inserts.length === 0 ? 0 : inserts.filter((k) => k.synthetic).length / inserts.length;
  if (syntheticFraction > 0.2) invalidReasons.push("synthetic-input");

  return {
    wpm,
    rawWpm,
    accuracy,
    consistency,
    charCounts: counts,
    errorEvents,
    incorrectKeystrokes: counts.incorrect,
    series,
    byCode,
    byChar,
    byFinger,
    problemKeys,
    problemBigrams,
    durationMs,
    pausedMs,
    keystrokes: log.length,
    valid: invalidReasons.length === 0,
    invalidReasons,
  };
}
