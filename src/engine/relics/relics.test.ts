import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { BASE_STATS, type OwnedRelic } from "../types";
import { RELICS, RELIC_BY_ID } from "./defs";
import { addRelic, draftRelics, eligibleRelics, RelicRuntime } from "./runtime";
import { resolveStats, type StatOp } from "./types";

describe("relic definitions", () => {
  it("have unique ids", () => {
    const ids = RELICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declare a name, a blurb and at least one mechanism", () => {
    // A relic with neither modifiers nor hooks does nothing, which is the
    // easiest possible contribution mistake and completely invisible in play.
    for (const relic of RELICS) {
      expect(relic.name.length).toBeGreaterThan(0);
      expect(relic.blurb.length).toBeGreaterThan(10);
      expect(relic.maxStacks).toBeGreaterThanOrEqual(1);
      expect(Boolean(relic.modifiers || relic.hooks)).toBe(true);
    }
  });

  it("describe their effect concretely, not vaguely", () => {
    // A blurb the player has to guess at turns a choice into a coin flip.
    for (const relic of RELICS) {
      expect(relic.blurb).toMatch(/\.$/);
      const vague = /\b(better|improved|enhanced|stronger|more powerful)\b/i;
      expect(relic.blurb).not.toMatch(vague);
    }
  });

  it("reference only relics that exist in their exclusions", () => {
    for (const relic of RELICS) {
      for (const id of relic.exclusiveWith ?? []) {
        expect(RELIC_BY_ID[id], `${relic.id} excludes unknown ${id}`).toBeDefined();
      }
    }
  });

  it("produce only finite, sane stat values at full stacks", () => {
    for (const relic of RELICS) {
      if (!relic.modifiers) continue;
      const stats = resolveStats(BASE_STATS, relic.modifiers(relic.maxStacks));
      for (const [key, value] of Object.entries(stats)) {
        expect(Number.isFinite(value), `${relic.id} -> ${key}`).toBe(true);
      }
      // A relic must never make the game unplayable on its own.
      expect(stats.maxShields).toBeGreaterThan(0);
      expect(stats.floodRise).toBeGreaterThan(0);
      expect(stats.floodAccel).toBeGreaterThan(1);
      expect(stats.gapMax).toBeGreaterThan(0);
      expect(stats.errorCost).toBeGreaterThanOrEqual(0);
      expect(stats.comboCap).toBeGreaterThan(0);
    }
  });
});

describe("resolveStats", () => {
  it("applies operations in a fixed order regardless of input order", () => {
    // Otherwise the same two relics give different stats depending on which
    // was drafted first, and two players with identical builds disagree.
    const ops: StatOp[] = [
      { stat: "maxShields", op: "mul", value: 2 },
      { stat: "maxShields", op: "add", value: 1 },
    ];
    const forward = resolveStats(BASE_STATS, ops);
    const backward = resolveStats(BASE_STATS, [...ops].reverse());

    expect(forward.maxShields).toBe(backward.maxShields);
    // add before mul: (3 + 1) * 2
    expect(forward.maxShields).toBe(8);
  });

  it("supports set, add, mul, min and max", () => {
    expect(resolveStats(BASE_STATS, [{ stat: "comboCap", op: "set", value: 10 }]).comboCap).toBe(10);
    expect(resolveStats(BASE_STATS, [{ stat: "comboCap", op: "add", value: 5 }]).comboCap).toBe(55);
    expect(resolveStats(BASE_STATS, [{ stat: "comboCap", op: "mul", value: 2 }]).comboCap).toBe(100);
    // `min` raises to a floor; `max` lowers to a ceiling.
    expect(resolveStats(BASE_STATS, [{ stat: "maxShields", op: "min", value: 9 }]).maxShields).toBe(9);
    expect(resolveStats(BASE_STATS, [{ stat: "maxShields", op: "max", value: 2 }]).maxShields).toBe(2);
  });

  it("leaves the base table untouched", () => {
    const before = { ...BASE_STATS };
    resolveStats(BASE_STATS, [{ stat: "comboCap", op: "add", value: 99 }]);
    expect(BASE_STATS).toEqual(before);
  });
});

describe("RelicRuntime", () => {
  it("costs nothing when no relics are held", () => {
    const runtime = new RelicRuntime();
    const stats = runtime.rebuild([], BASE_STATS);
    expect(stats).toEqual(BASE_STATS);
    expect(runtime.hookCount("cleared")).toBe(0);
  });

  it("is idempotent — rebuilding twice gives the same stats", () => {
    const runtime = new RelicRuntime();
    const owned: OwnedRelic[] = [
      { id: "wide-aperture", stacks: 2 },
      { id: "reinforced-hull", stacks: 1 },
    ];
    const first = runtime.rebuild(owned, BASE_STATS);
    const second = runtime.rebuild(owned, BASE_STATS);
    expect(second).toEqual(first);
    // And hooks must not accumulate across rebuilds.
    expect(runtime.hookCount("cleared")).toBe(0);
  });

  it("does not duplicate hooks when rebuilt", () => {
    const runtime = new RelicRuntime();
    const owned: OwnedRelic[] = [{ id: "long-baseline", stacks: 1 }];
    runtime.rebuild(owned, BASE_STATS);
    const once = runtime.hookCount("cleared");
    runtime.rebuild(owned, BASE_STATS);
    expect(runtime.hookCount("cleared")).toBe(once);
  });

  it("gives the same stats regardless of the order relics were drafted", () => {
    const runtime = new RelicRuntime();
    const a = runtime.rebuild(
      [{ id: "reinforced-hull", stacks: 1 }, { id: "narrow-band", stacks: 1 }],
      BASE_STATS,
    );
    const b = runtime.rebuild(
      [{ id: "narrow-band", stacks: 1 }, { id: "reinforced-hull", stacks: 1 }],
      BASE_STATS,
    );
    expect(b).toEqual(a);
  });

  it("stacks a relic's effect", () => {
    const runtime = new RelicRuntime();
    const one = runtime.rebuild([{ id: "wide-aperture", stacks: 1 }], BASE_STATS);
    const two = runtime.rebuild([{ id: "wide-aperture", stacks: 2 }], BASE_STATS);
    expect(two.comboCap).toBeGreaterThan(one.comboCap);
  });

  it("keeps the flood accelerating even at full stacks of everything", () => {
    // A relic pool that could flatten the acceleration curve would produce a
    // run that never ends, which is worse than one that ends too soon.
    const runtime = new RelicRuntime();
    const everything = RELICS.map((r) => ({ id: r.id, stacks: r.maxStacks }));
    expect(runtime.rebuild(everything, BASE_STATS).floodAccel).toBeGreaterThan(1);
  });
});

describe("drafting", () => {
  it("offers three distinct relics", () => {
    const rng = makeRng("draft-test", "draft");
    const offers = draftRelics([], 1, rng);
    expect(offers).toHaveLength(3);
    expect(new Set(offers).size).toBe(3);
  });

  it("is deterministic for a seed", () => {
    const a = draftRelics([], 3, makeRng("same", "draft"));
    const b = draftRelics([], 3, makeRng("same", "draft"));
    expect(a).toEqual(b);
  });

  it("never offers a relic already at max stacks", () => {
    const owned: OwnedRelic[] = [{ id: "swarm-protocol", stacks: 1 }];
    const eligible = eligibleRelics(owned, 10).map((r) => r.id);
    expect(eligible).not.toContain("swarm-protocol");
  });

  it("respects mutual exclusion in both directions when any relic declares it", () => {
    // No relic in the pool currently declares an exclusion, so this asserts
    // the mechanism rather than a specific pair -- if one is added later, the
    // check already covers it from both sides.
    for (const relic of RELICS) {
      for (const other of relic.exclusiveWith ?? []) {
        expect(eligibleRelics([{ id: relic.id, stacks: 1 }], 10).map((r) => r.id))
          .not.toContain(other);
        expect(eligibleRelics([{ id: other, stacks: 1 }], 10).map((r) => r.id))
          .not.toContain(relic.id);
      }
    }
  });

  it("withholds late-game relics in early bands", () => {
    const band1 = eligibleRelics([], 1).map((r) => r.id);
    expect(band1).not.toContain("held-breath");
    expect(eligibleRelics([], 6).map((r) => r.id)).toContain("held-breath");
  });

  it("offers fewer than three when the pool runs dry", () => {
    // Must degrade rather than loop forever or repeat an offer.
    const owned = RELICS.map((r) => ({ id: r.id, stacks: r.maxStacks }));
    expect(draftRelics(owned, 20, makeRng("dry", "draft"))).toHaveLength(0);
  });
});

describe("addRelic", () => {
  it("stacks up to the relic's limit and no further", () => {
    const owned: OwnedRelic[] = [];
    const def = RELIC_BY_ID["wide-aperture"];
    for (let i = 0; i < 10; i++) addRelic(owned, "wide-aperture");
    expect(owned).toHaveLength(1);
    expect(owned[0].stacks).toBe(def.maxStacks);
  });
});

describe("no relic combination breaks the game", () => {
  it("keeps stats sane across many random builds", () => {
    // Individual relics are easy to reason about; interactions are not. This
    // is the test that catches a multiplier stacking with a floor into
    // something unplayable.
    const runtime = new RelicRuntime();

    for (let seed = 0; seed < 300; seed++) {
      const rng = makeRng(`build-${seed}`, "draft");
      const owned: OwnedRelic[] = [];

      // Draft repeatedly, as a long run would.
      for (let wave = 1; wave <= 12; wave++) {
        const offers = draftRelics(owned, wave, rng);
        if (offers.length === 0) break;
        addRelic(owned, offers[rng.int(offers.length)]);
      }

      const stats = runtime.rebuild(owned, BASE_STATS);
      const build = owned.map((o) => `${o.id}x${o.stacks}`).join(", ");

      for (const [key, value] of Object.entries(stats)) {
        expect(Number.isFinite(value), `${key} with ${build}`).toBe(true);
      }
      expect(stats.maxShields, build).toBeGreaterThan(0);
      expect(stats.maxShields, build).toBeLessThan(40);
      expect(stats.floodRise, build).toBeGreaterThan(0);
      // The flood must always accelerate, or a run never ends.
      expect(stats.floodAccel, build).toBeGreaterThan(1);
      expect(stats.gapMax, build).toBeGreaterThan(0.5);
      expect(stats.gapMax, build).toBeLessThan(12);
      expect(stats.errorCost, build).toBeGreaterThanOrEqual(0);
      expect(stats.comboCap, build).toBeGreaterThan(0);
      expect(stats.perfectDipFactor, build).toBeGreaterThan(0);
      expect(stats.perfectDipFactor, build).toBeLessThanOrEqual(1);
    }
  });

  it("never drafts two mutually exclusive relics into one build", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeRng(`excl-${seed}`, "draft");
      const owned: OwnedRelic[] = [];
      for (let wave = 1; wave <= 15; wave++) {
        const offers = draftRelics(owned, wave, rng);
        if (offers.length === 0) break;
        addRelic(owned, offers[rng.int(offers.length)]);
      }
      const ids = new Set(owned.map((o) => o.id));
      for (const id of ids) {
        for (const other of RELIC_BY_ID[id].exclusiveWith ?? []) {
          expect(ids.has(other), `${id} + ${other}`).toBe(false);
        }
      }
    }
  });
});
