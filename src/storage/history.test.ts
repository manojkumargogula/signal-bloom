import { beforeEach, describe, expect, it } from "vitest";
import { loadBests, loadHistory } from "./history";

/**
 * The migration is the risky part of retiring a mode, and it has now been the
 * risky part twice: a naive version bump would take EVERY stored run with it,
 * including the ones from the mode that is still here. So each case below
 * feeds a real older file and asserts that the surviving runs survive.
 *
 * It matters that both older versions are covered. Someone who last played
 * before Ascent existed has a schema-1 file and someone who played during the
 * three-mode build has a schema-2 one, and handling only the version
 * immediately behind would be the same data loss with extra steps.
 */
const HISTORY_KEY = "signalbloom:v1:history";
const BESTS_KEY = "signalbloom:v1:bests";

function entry(id: string, mode: string, wpm: number) {
  return {
    id,
    mode,
    seed: "abc123",
    corpusId: "en-climb",
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

describe("history migration", () => {
  beforeEach(() => localStorage.clear());

  it("drops runs from every retired mode and keeps the climbs", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        schema: 1,
        runs: [
          entry("a", "onslaught", 70),
          entry("b", "sprint", 92),
          entry("c", "ascent", 61),
          entry("d", "zen", 84),
          entry("e", "ascent", 74),
        ],
      }),
    );

    const runs = loadHistory();
    expect(runs.map((r) => r.id)).toEqual(["c", "e"]);
  });

  it("migrates a schema 2 file, not only the oldest one", () => {
    // The three-mode build wrote schema 2. Accepting only the version
    // immediately behind the current one would wipe those players' climbs.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        schema: 2,
        runs: [entry("a", "sprint", 92), entry("b", "ascent", 58), entry("c", "zen", 40)],
      }),
    );

    expect(loadHistory().map((r) => r.id)).toEqual(["b"]);
  });

  it("rewrites the file, so the migration runs once rather than every read", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 1, runs: [entry("a", "onslaught", 70), entry("b", "ascent", 92)] }),
    );

    loadHistory();
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) as string);
    expect(stored.schema).toBe(3);
    expect(stored.runs).toHaveLength(1);
  });

  it("drops a retired mode's personal best too", () => {
    // Otherwise a record survives that nothing can ever match again.
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ schema: 1, runs: [] }));
    localStorage.setItem(
      BESTS_KEY,
      JSON.stringify({
        onslaught: { wpm: 70, accuracy: 95, at: 1 },
        // Schema 2 keyed a timed mode's bests by mode AND length, so the
        // retirement has to match on the part before the colon.
        "sprint:30000": { wpm: 92, accuracy: 97, at: 2 },
        ascent: { wpm: 61, accuracy: 94, at: 3 },
      }),
    );

    loadHistory();
    expect(Object.keys(loadBests())).toEqual(["ascent"]);
  });

  it("leaves a current file alone", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 3, runs: [entry("b", "ascent", 92)] }),
    );
    expect(loadHistory()).toHaveLength(1);
  });

  it("returns nothing for a version it does not understand", () => {
    // A file from a newer build. Showing an empty history beats guessing at
    // a shape and rendering nonsense.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ schema: 99, runs: [entry("b", "ascent", 92)] }),
    );
    expect(loadHistory()).toEqual([]);
  });

  it("survives a corrupt file", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
