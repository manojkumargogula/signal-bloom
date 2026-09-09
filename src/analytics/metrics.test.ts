import { describe, expect, it } from "vitest";
import { computeMetrics, consistencyFrom } from "./metrics";
import { inputFor, targetsOf, typePerfectly, typeSequence } from "./fixtures";
import type { KeystrokeEvent } from "./types";

describe("speed", () => {
  it("computes exactly 120 WPM for 10 chars/second", () => {
    // 5 chars = 1 word, so 10 chars/sec = 2 words/sec = 120 WPM. Chosen so
    // the expected value is arithmetic rather than a recorded observation.
    const targets = targetsOf("the quick brown fox jumps over lazy dogs abcd efgh");
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.wpm).toBeCloseTo(120, 0);
    expect(m.rawWpm).toBeCloseTo(120, 0);
    expect(m.accuracy).toBe(100);
  });

  it("reports raw above net when errors are left uncorrected", () => {
    const targets = ["cat"];
    // "cxt": the wrong middle character is never fixed.
    const { log, durationMs } = typeSequence(targets, [
      { ch: "c" }, { ch: "x" }, { ch: "t" },
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.charCounts.typed).toBe(3);
    expect(m.charCounts.correctFinal).toBe(2);
    expect(m.rawWpm).toBeGreaterThan(m.wpm);
  });

  it("credits a corrected character to net speed but not to accuracy", () => {
    // This is the central distinction in the whole module: fixing a typo
    // should improve your speed, and must not improve your accuracy.
    const targets = ["cat"];
    const { log, durationMs } = typeSequence(targets, [
      { ch: "c" }, { ch: "x" }, { ch: "\b" }, { ch: "a" }, { ch: "t" },
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.charCounts.correctFinal).toBe(3);
    expect(m.charCounts.corrected).toBe(1);
    expect(m.accuracy).toBeCloseTo((2 / 3) * 100, 5);
  });
});

describe("accuracy", () => {
  it("is judged at first press and never healed by backspace", () => {
    const targets = ["hello"];
    const clean = typeSequence(targets, "hello".split("").map((ch) => ({ ch })));
    const healed = typeSequence(targets, [
      { ch: "h" }, { ch: "e" }, { ch: "l" }, { ch: "x" },
      { ch: "\b" }, { ch: "l" }, { ch: "o" },
    ]);

    const a = computeMetrics(clean.log, inputFor(targets, clean.durationMs));
    const b = computeMetrics(healed.log, inputFor(targets, healed.durationMs));

    expect(a.accuracy).toBe(100);
    expect(b.accuracy).toBeLessThan(100);
    // Both end with the correct text, so net speed is comparable...
    expect(b.charCounts.correctFinal).toBe(5);
    // ...but the error is permanent in the accuracy figure.
    expect(b.accuracy).toBeCloseTo((4 / 5) * 100, 5);
  });

  it("does not double-penalise a retyped position", () => {
    // Retyping after a correction is not a second error: the position's first
    // press already counted, and the retry is excluded entirely.
    const targets = ["ab"];
    const { log, durationMs } = typeSequence(targets, [
      { ch: "z" }, { ch: "\b" }, { ch: "z" }, { ch: "\b" }, { ch: "a" }, { ch: "b" },
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    const firstPresses = log.filter((k) => k.kind === "insert" && k.firstPress);
    expect(firstPresses).toHaveLength(2);
    expect(m.accuracy).toBeCloseTo(50, 5);
  });
});

describe("consistency", () => {
  it("is 100 for a perfectly even run", () => {
    expect(consistencyFrom([60, 60, 60, 60])).toBe(100);
  });

  it("is null when there is not enough signal to judge", () => {
    // Reporting 100% consistency for a one-second run would be a lie the
    // player catches immediately.
    expect(consistencyFrom([])).toBeNull();
    expect(consistencyFrom([60])).toBeNull();
    expect(consistencyFrom([0, 0, 0])).toBeNull();
  });

  it("falls as variance rises, and never goes negative", () => {
    const even = consistencyFrom([60, 60, 60, 60]) as number;
    const wobbly = consistencyFrom([40, 80, 45, 75]) as number;
    const wild = consistencyFrom([0, 200, 0, 200, 0]) as number;

    expect(even).toBeGreaterThan(wobbly);
    expect(wobbly).toBeGreaterThan(wild);
    expect(wild).toBeGreaterThanOrEqual(0);
  });

  it("approximates 100*(1-cv) for small variation", () => {
    // The mapping is the Taylor series of artanh, so it should agree closely
    // with the naive linear form while variation is low.
    const series = [98, 100, 102, 100];
    const mu = 100;
    const sigma = Math.sqrt(series.reduce((a, b) => a + (b - mu) ** 2, 0) / series.length);
    const naive = 100 * (1 - sigma / mu);
    expect(consistencyFrom(series) as number).toBeCloseTo(naive, 1);
  });
});

describe("per-second series", () => {
  it("emits one bin per second of the run", () => {
    const targets = targetsOf("aaaaa bbbbb ccccc ddddd eeeee fffff");
    const { log } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, 3000));
    expect(m.series).toHaveLength(3);
    expect(m.series.map((s) => s.second)).toEqual([1, 2, 3]);
  });

  it("counts an idle second as zero rather than skipping it", () => {
    // A pause is real information about consistency. Dropping empty bins
    // would make a run with a five-second stall look perfectly even.
    const targets = ["abcdefghij"];
    const { log } = typeSequence(targets, [
      { ch: "a" }, { ch: "b" }, { ch: "c" }, { ch: "d" }, { ch: "e" },
      { ch: "f", gap: 2000 },
      { ch: "g" }, { ch: "h" }, { ch: "i" }, { ch: "j" },
    ], 100);
    const m = computeMetrics(log, inputFor(targets, 3000));

    const idle = m.series.filter((s) => s.raw === 0);
    expect(idle.length).toBeGreaterThan(0);
    expect(m.consistency).not.toBe(100);
  });

  it("excludes a partial trailing second from consistency", () => {
    const targets = targetsOf("aaaaa bbbbb ccccc");
    const { log } = typePerfectly(targets, 100);
    // 2100ms: the third bin holds only 100ms of real time, so its raw
    // figure is a wild extrapolation and must not drag consistency down.
    const m = computeMetrics(log, inputFor(targets, 2100));
    expect(m.series).toHaveLength(3);
    expect(m.series[2].partial).toBe(true);
    expect(m.series[0].partial).toBeUndefined();
  });
});

describe("per-key and per-finger stats", () => {
  it("keys the heatmap by physical code, not by character", () => {
    const targets = ["aaaaaaaa"];
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.byCode.KeyA.attempts).toBe(8);
    expect(m.byChar.a.attempts).toBe(8);
    expect(m.byFinger.LP.attempts).toBe(8);
  });

  it("keeps Digit1 and Numpad1 separate", () => {
    // Numbers mode depends on the distinction; merging them would make the
    // heatmap wrong for anyone using a numpad.
    const targets = ["11"];
    const { log, durationMs } = typeSequence(targets, [
      { ch: "1", code: "Digit1" },
      { ch: "1", code: "Numpad1" },
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.byCode.Digit1.attempts).toBe(1);
    expect(m.byCode.Numpad1.attempts).toBe(1);
  });

  it("excludes synthetic input from the heatmap but counts it for speed", () => {
    // An IME commit or an autocorrect produces a character with no physical
    // key. It is real typing, but we cannot say which key was pressed.
    const targets = ["abcd"];
    const { log, durationMs } = typeSequence(targets, [
      { ch: "a" },
      { ch: "b", code: null, synthetic: true },
      { ch: "c" },
      { ch: "d" },
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.charCounts.typed).toBe(4);
    expect(m.byCode.KeyB).toBeUndefined();
    expect(m.byCode.KeyA.attempts).toBe(1);
  });

  it("excludes thinking pauses from latency but not from speed", () => {
    const targets = ["abcdef"];
    const { log, durationMs } = typeSequence(targets, [
      { ch: "a" }, { ch: "b" }, { ch: "c" },
      { ch: "d", gap: 4000 }, // a pause, not a slow keypress
      { ch: "e" }, { ch: "f" },
    ], 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    // The 4s gap must not be recorded as D taking four seconds to press.
    expect(m.byCode.KeyD.meanLatency).toBeNull();
    // But the run really did take that long, so speed reflects it.
    expect(m.durationMs).toBeGreaterThan(4000);
  });

  it("reports every finger, including untouched ones", () => {
    const targets = ["aaa"];
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(Object.keys(m.byFinger)).toHaveLength(10);
    expect(m.byFinger.RP.attempts).toBe(0);
  });
});

describe("problem keys", () => {
  it("ignores keys with too few attempts to judge", () => {
    // Wilson's lower bound is what stops "you pressed Z once and got it
    // wrong" from becoming the player's headline weakness.
    const targets = ["az"];
    const { log, durationMs } = typeSequence(targets, [{ ch: "a" }, { ch: "q" }]);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(m.problemKeys).toHaveLength(0);
  });

  it("surfaces a key that is consistently wrong", () => {
    const targets = ["kkkkkkkkkkkk"];
    // 12 attempts at K, half of them wrong.
    const steps = Array.from({ length: 12 }, (_, i) => ({ ch: i % 2 === 0 ? "k" : "j" }));
    const { log, durationMs } = typeSequence(targets, steps);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    // All 12 attempts are attributed to K, the key that was needed —
    // not split between K and the J that was wrongly pressed.
    expect(m.byCode.KeyK.attempts).toBe(12);
    expect(m.byCode.KeyK.correct).toBe(6);
    expect(m.byCode.KeyJ).toBeUndefined();

    expect(m.problemKeys.length).toBeGreaterThan(0);
    expect(m.problemKeys[0].key).toBe("KeyK");
    expect(m.problemKeys[0].costMs).toBeGreaterThan(0);
  });
});

describe("validity", () => {
  it("flags a run that is too short to mean anything", () => {
    const targets = ["ab"];
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(m.valid).toBe(false);
    expect(m.invalidReasons).toContain("too-short");
  });

  it("flags a long idle gap", () => {
    const targets = ["abcdefghijkl"];
    const { log, durationMs } = typeSequence(targets, [
      ..."abcdef".split("").map((ch) => ({ ch })),
      { ch: "g", gap: 15_000 },
      ..."hijkl".split("").map((ch) => ({ ch })),
    ], 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(m.invalidReasons).toContain("idle-gap");
  });

  it("passes a normal run", () => {
    const targets = targetsOf("the quick brown fox jumps over the lazy dog again");
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(m.valid).toBe(true);
    expect(m.invalidReasons).toEqual([]);
  });
});

describe("degenerate input", () => {
  it("produces no NaN or Infinity for an empty log", () => {
    const m = computeMetrics([], inputFor(["abc"], 0));
    const numbers = [m.wpm, m.rawWpm, m.accuracy, m.durationMs];
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    expect(m.consistency).toBeNull();
    expect(m.problemKeys).toEqual([]);
  });

  it("survives a single keystroke", () => {
    const targets = ["a"];
    const { log, durationMs } = typePerfectly(targets, 100);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    expect(Number.isFinite(m.wpm)).toBe(true);
    expect(m.consistency).toBeNull();
  });

  it("handles an all-wrong run without dividing by zero", () => {
    const targets = ["aaaaaaaaaaaa"];
    const steps = Array.from({ length: 12 }, () => ({ ch: "z" }));
    const { log, durationMs } = typeSequence(targets, steps);
    const m = computeMetrics(log, inputFor(targets, durationMs));

    expect(m.accuracy).toBe(0);
    expect(m.wpm).toBe(0);
    expect(m.rawWpm).toBeGreaterThan(0);
    expect(Number.isFinite(m.wpm)).toBe(true);
  });
});

describe("counts reconcile", () => {
  it("balances typed against correct, incorrect and extra", () => {
    // If this drifts, two numbers on the results screen contradict each
    // other and the player is right not to trust either.
    const targets = targetsOf("hello world again");
    const { log, durationMs } = typeSequence(targets, [
      ..."hello ".split("").map((ch) => ({ ch })),
      { ch: "w" }, { ch: "x" }, { ch: "r" }, { ch: "l" }, { ch: "d" }, { ch: " " },
      ..."again".split("").map((ch) => ({ ch })),
    ]);
    const m = computeMetrics(log, inputFor(targets, durationMs));
    const { typed, correctFinal, corrected } = m.charCounts;

    const insertCount = (log as KeystrokeEvent[]).filter((k) => k.kind === "insert").length;
    expect(typed).toBe(insertCount);
    expect(correctFinal).toBeLessThanOrEqual(typed);
    expect(corrected).toBeGreaterThanOrEqual(0);
  });
});
