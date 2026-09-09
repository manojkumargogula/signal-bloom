import { beforeEach, describe, expect, it } from "vitest";
import { loadBests, loadHistory } from "./history";

/**
 * The migration is the risky part of retiring a mode: the naive version bump
 * would have taken Sprint and Zen history with it, and that is the history
 * players actually care about because those are the modes that set records.
 */
const HISTORY_KEY = "signalbloom:v1:history";
const BESTS_KEY = "signalbloom:v1:bests";

function entry(id: string, mode: string, wpm: number) {
  return {
    id,
    mode,
    seed: "abc123",
    corpusId: "en-common",
    startedAt: 1_700_000_000_000,
    layoutId: "qwerty",
    metrics: {
      wpm,
      rawWpm: wpm + 4,
      accuracy: 97,
      consistency: 88,
      durationMs: 30_000,
      valid: true,
    },
  };
}

describe("history migration from schema 1", () => {
  beforeEach(() => localStorage.clear());

  it("drops runs from a retired mode and keeps everything else", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        schema: 1,
        runs: [
          entry("a", "onslaught", 70),
          entry("b", "sprint", 92),
          entry("c", "zen", 84),
          entry("d", "onslaught", 66),
        ],
      }),
    );

    const runs = loadHistory();
    expect(runs.map((r) => r.mode)).toEqual(["sprint", "zen"]);
  });

  it("rewrites the file, so the migration runs once rather than every read", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 1, runs: [entry("a", "onslaught", 70), entry("b", "sprint", 92)] }),
    );

    loadHistory();
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) as string);
    expect(stored.schema).toBe(2);
    expect(stored.runs).toHaveLength(1);
  });

  it("drops a retired mode's personal best too", () => {
    // Otherwise a record survives that nothing can ever match again.
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ schema: 1, runs: [] }));
    localStorage.setItem(
      BESTS_KEY,
      JSON.stringify({
        onslaught: { wpm: 70, accuracy: 95, at: 1 },
        "sprint:30000": { wpm: 92, accuracy: 97, at: 2 },
      }),
    );

    loadHistory();
    expect(Object.keys(loadBests())).toEqual(["sprint:30000"]);
  });

  it("leaves a current file alone", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 2, runs: [entry("b", "sprint", 92)] }),
    );
    expect(loadHistory()).toHaveLength(1);
  });

  it("returns nothing for a version it does not understand", () => {
    // A file from a newer build. Showing an empty history beats guessing at
    // a shape and rendering nonsense.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 99, runs: [entry("b", "sprint", 92)] }),
    );
    expect(loadHistory()).toEqual([]);
  });

  it("survives a corrupt file", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
