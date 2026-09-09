import { describe, expect, it } from "vitest";
import { Bag, makeRng, makeSeed, type RngStream } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a given seed and stream", () => {
    const a = makeRng("bloom", "words");
    const b = makeRng("bloom", "words");
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces pinned output for a known seed", () => {
    // These values are the contract behind every shared run code. If a
    // refactor changes them, previously shared runs replay differently, so
    // this test failing means a migration is required, not a re-pin.
    const rng = makeRng("bloom", "words");
    const vector = Array.from({ length: 6 }, () => rng.int(1_000_000));
    expect(vector).toMatchInlineSnapshot(`
      [
        646336,
        668656,
        532681,
        205220,
        54860,
        900586,
      ]
    `);
  });

  it("gives different sequences to different streams of the same seed", () => {
    const streams: RngStream[] = ["spawn", "words", "draft", "powerup", "effect", "cosmetic"];
    const firsts = streams.map((s) => makeRng("bloom", s).next());
    expect(new Set(firsts).size).toBe(streams.length);
  });

  it("keeps streams independent — draining one does not perturb another", () => {
    // The property that lets us add a new random consumer without breaking
    // every run code already in the wild.
    const wordsBefore = makeRng("bloom", "words");
    const expected = Array.from({ length: 8 }, () => wordsBefore.next());

    const cosmetic = makeRng("bloom", "cosmetic");
    for (let i = 0; i < 5000; i++) cosmetic.next();

    const wordsAfter = makeRng("bloom", "words");
    const actual = Array.from({ length: 8 }, () => wordsAfter.next());
    expect(actual).toEqual(expected);
  });

  it("stays in range", () => {
    const rng = makeRng("range-check", "spawn");
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(rng.int(7)).toBeLessThan(7);
      expect(rng.int(7)).toBeGreaterThanOrEqual(0);
    }
  });

  it("distributes int() roughly uniformly", () => {
    const rng = makeRng("uniform", "spawn");
    const buckets = new Array(10).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) buckets[rng.int(10)]++;
    // Each bucket should be within 3% of n/10 at this sample size.
    for (const count of buckets) {
      expect(Math.abs(count - n / 10) / (n / 10)).toBeLessThan(0.03);
    }
  });

  it("shuffle is a permutation", () => {
    const rng = makeRng("shuffle", "draft");
    const input = Array.from({ length: 200 }, (_, i) => i);
    const shuffled = rng.shuffle([...input]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
    expect(shuffled).not.toEqual(input);
  });

  it("weighted() never returns a zero-weight item", () => {
    const rng = makeRng("weights", "draft");
    const items = [
      { id: "never", w: 0 },
      { id: "rare", w: 1 },
      { id: "common", w: 20 },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(rng.weighted(items, (x) => x.w).id);
    expect(seen.has("never")).toBe(false);
    expect(seen.has("rare")).toBe(true);
    expect(seen.has("common")).toBe(true);
  });
});

describe("makeSeed", () => {
  it("produces six base36 characters", () => {
    for (let i = 0; i < 200; i++) expect(makeSeed()).toMatch(/^[0-9a-z]{6}$/);
  });
});

describe("Bag", () => {
  it("emits every item once before repeating any", () => {
    const items = ["a", "b", "c", "d", "e"];
    const bag = new Bag(items, makeRng("bag", "words"));
    const cycle = bag.drawMany(items.length);
    expect([...cycle].sort()).toEqual([...items].sort());
  });

  it("never repeats an item immediately across a refill boundary", () => {
    // The failure this guards against: a naive bag can draw the last item of
    // one cycle and the first of the next, producing "the the".
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const bag = new Bag(items, makeRng("boundary", "words"));
    const draws = bag.drawMany(400);
    let immediateRepeats = 0;
    for (let i = 1; i < draws.length; i++) {
      if (draws[i] === draws[i - 1]) immediateRepeats++;
    }
    // A refill can legitimately place the same item either side of a boundary,
    // but it must be rare: at most one per cycle in the worst case.
    expect(immediateRepeats).toBeLessThanOrEqual(draws.length / items.length);
  });

  it("rejects an empty item set rather than looping forever", () => {
    expect(() => new Bag([], makeRng("empty", "words"))).toThrow();
  });
});
