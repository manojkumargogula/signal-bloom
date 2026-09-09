import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { PLATFORMS_PER_BAND } from "@/data/bands";
import {
  active,
  applyChar,
  bandForHeight,
  clearPlatform,
  createAscentState,
  createAscentState as fresh,
  ERROR_COST,
  FLOOD_ACCEL,
  FLOOD_BASE,
  GAP_MAX,
  jumpProgress,
  lengthForBand,
  LOOKAHEAD,
  MAX_CHARGED_PER_SECOND,
  MAX_CHARGED_PER_WORD,
  MAX_WORD_LENGTH,
  refill,
  SAME_KEY_GRACE_MS,
  SHIELD_START,
  SKIP_AFTER,
  stepAscent,
  type AscentContext,
  type AscentState,
} from "./ascent";

const DT = 1000 / 60;

/** A context with fixed words, so a test can spell them out. */
function ctxWith(words: string[], seed = "ascent"): AscentContext {
  return {
    drawWord: (_band, index) => words[index % words.length],
    rng: makeRng(seed, "spawn"),
  };
}

function start(words: string[], seed = "ascent") {
  const state = createAscentState();
  const ctx = ctxWith(words, seed);
  refill(state, ctx);
  return { state, ctx };
}

/** Types a whole word correctly and commits the clear. */
function climb(state: AscentState, ctx: AscentContext, now = 0): void {
  const platform = active(state);
  if (!platform) return;
  let t = now;
  for (const ch of platform.word) {
    t += 100;
    const outcome = applyChar(state, ctx, ch, t);
    if (outcome.kind === "cleared") clearPlatform(state, ctx, outcome.perfect);
  }
}

describe("the visible stack", () => {
  it("keeps the active platform plus the lookahead filled", () => {
    const { state } = start(["ab", "cd", "ef", "gh", "ij", "kl"]);
    expect(state.visible).toHaveLength(LOOKAHEAD + 1);
    expect(active(state)?.index).toBe(0);
  });

  it("indexes platforms densely from zero", () => {
    // This is what lets the analytics layer treat the platform index as a
    // target index directly, with none of the sparse-array padding the radar
    // mode needed.
    const { state, ctx } = start(["ab", "cd", "ef", "gh"]);
    for (let i = 0; i < 5; i++) climb(state, ctx, i * 1000);
    expect(state.visible.map((p) => p.index)).toEqual([5, 6, 7, 8]);
  });
});

describe("typing a platform", () => {
  it("advances on a correct character and charges the crouch", () => {
    const { state, ctx } = start(["four"]);
    expect(applyChar(state, ctx, "f", 100).kind).toBe("progress");
    expect(active(state)?.typed).toBe(1);
    expect(state.charge).toBeCloseTo(0.25, 5);
  });

  it("clears on the final character", () => {
    const { state, ctx } = start(["go"]);
    applyChar(state, ctx, "g", 100);
    const outcome = applyChar(state, ctx, "o", 200);
    expect(outcome.kind).toBe("cleared");
  });

  it("does not advance on a wrong character", () => {
    // The player stays put and retries. A mistake costs time and distance,
    // but never strands them.
    const { state, ctx } = start(["four"]);
    const outcome = applyChar(state, ctx, "x", 100);
    expect(outcome.kind).toBe("error");
    expect(active(state)?.typed).toBe(0);
  });

  it("marks a word imperfect for the rest of the platform", () => {
    const { state, ctx } = start(["four"]);
    applyChar(state, ctx, "x", 100);
    for (const [i, ch] of [..."four"].entries()) {
      const outcome = applyChar(state, ctx, ch, 200 + i * 100);
      if (outcome.kind === "cleared") expect(outcome.perfect).toBe(false);
    }
  });
});

describe("errors and the flood", () => {
  it("spends a shield before it costs any distance", () => {
    const { state, ctx } = start(["four"]);
    const gap = state.gap;
    applyChar(state, ctx, "x", 100);
    expect(state.shields).toBe(SHIELD_START - 1);
    expect(state.gap).toBe(gap);
  });

  it("costs distance once the shields are gone", () => {
    // Shields have to be spent across several platforms, not one. With three
    // shields and a three-charged-error cap per word, a single word can never
    // cost distance -- the shields run out exactly as the cap engages. That
    // is a pleasant accident of the two numbers and makes the opening word
    // forgiving, but it means this test has to climb to reach the state it
    // is checking.
    const { state, ctx } = start(["go", "up", "on", "at", "so"]);
    let t = 0;

    for (let i = 0; i < SHIELD_START; i++) {
      t += SAME_KEY_GRACE_MS + 50;
      applyChar(state, ctx, "z", t);
      // Clear the platform so the next error lands on a fresh word.
      climb(state, ctx, t);
      t += 1000;
    }
    expect(state.shields).toBe(0);

    const gap = state.gap;
    t += SAME_KEY_GRACE_MS + 50;
    applyChar(state, ctx, "z", t);
    expect(state.gap).toBeCloseTo(gap - ERROR_COST, 5);
  });

  it("softens later errors on the same word", () => {
    // So one hard word cannot spiral a run into the water.
    const { state, ctx } = start(["aaaaaaaa"]);
    state.shields = 0;
    let t = 0;

    const costs: number[] = [];
    for (let i = 0; i < MAX_CHARGED_PER_WORD; i++) {
      const before = state.gap;
      t += SAME_KEY_GRACE_MS + 50;
      applyChar(state, ctx, String.fromCharCode(98 + i), t);
      costs.push(before - state.gap);
    }

    expect(costs[0]).toBeGreaterThan(costs[1]);
    expect(costs[1]).toBeGreaterThan(costs[2]);
  });

  it("never lets the gap go negative", () => {
    const { state, ctx } = start(["aaaaaaaa"]);
    state.shields = 0;
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 400;
      applyChar(state, ctx, "z", t);
      stepAscent(state, DT);
    }
    expect(state.gap).toBeGreaterThanOrEqual(0);
  });
});

describe("mash protection", () => {
  it("does not charge a repeat of the same wrong key inside the grace window", () => {
    // Hammering one wrong key is motor stutter, not repeated decisions.
    const { state, ctx } = start(["four"]);
    applyChar(state, ctx, "x", 1000);
    const shields = state.shields;

    const again = applyChar(state, ctx, "x", 1000 + SAME_KEY_GRACE_MS - 10);
    expect(again.kind).toBe("error");
    if (again.kind === "error") expect(again.charged).toBe(false);
    expect(state.shields).toBe(shields);
  });

  it("charges the same key again once the window has passed", () => {
    const { state, ctx } = start(["four"]);
    applyChar(state, ctx, "x", 1000);
    const outcome = applyChar(state, ctx, "x", 1000 + SAME_KEY_GRACE_MS + 10);
    if (outcome.kind === "error") expect(outcome.charged).toBe(true);
  });

  it("caps charged errors per platform", () => {
    // Without this, one hard word can end a run.
    const { state, ctx } = start(["aaaaaaaa"]);
    let t = 0;
    let charged = 0;
    for (let i = 0; i < 12; i++) {
      // A different wrong key each time, well spaced, so only the per-word
      // cap can be what stops them counting.
      t += 2000;
      const outcome = applyChar(state, ctx, String.fromCharCode(98 + (i % 20)), t);
      if (outcome.kind === "error" && outcome.charged) charged++;
    }
    expect(charged).toBe(MAX_CHARGED_PER_WORD);
  });

  it("rate-limits charged errors per second", () => {
    // Also the WCAG 2.3.1 flash cap: the visual error flash is driven by the
    // same decision, so it can never exceed a few per second.
    const { state, ctx } = start(["aaaaaaaaaaaaaaaaaaaa"]);
    let charged = 0;
    for (let i = 0; i < 20; i++) {
      // All inside one second, all different keys, so the per-word cap is
      // raised out of the way first.
      state.visible[0].charged = 0;
      const outcome = applyChar(state, ctx, String.fromCharCode(98 + i), 500 + i * 10);
      if (outcome.kind === "error" && outcome.charged) charged++;
    }
    expect(charged).toBeLessThanOrEqual(MAX_CHARGED_PER_SECOND);
  });
});

describe("the softlock escape", () => {
  it("gives away a character the player cannot produce", () => {
    // Someone on a different keyboard layout, or hitting a dead key, would
    // otherwise be stuck until the flood took them with no explanation.
    const { state, ctx } = start(["four"]);
    let outcome;
    for (let i = 0; i < SKIP_AFTER; i++) {
      outcome = applyChar(state, ctx, "ñ", 1000 + i * 2000);
    }
    expect(outcome?.kind).toBe("skipped");
    expect(active(state)?.typed).toBe(1);
    expect(state.combo).toBe(0);
  });

  it("offers a fingering hint before giving up", () => {
    const { state, ctx } = start(["four"]);
    const first = applyChar(state, ctx, "x", 1000);
    if (first.kind === "error") expect(first.hint).toBe(false);

    let outcome;
    for (let i = 1; i < 3; i++) outcome = applyChar(state, ctx, "x", 1000 + i * 2000);
    if (outcome?.kind === "error") expect(outcome.hint).toBe(true);
  });
});

describe("the flood", () => {
  it("accelerates per platform cleared, never per second", () => {
    // The whole reason one curve can serve a 40 WPM player and a 120 WPM
    // player: the flood is fast because you climbed, not because time passed.
    const { state, ctx } = start(["ab"]);
    expect(state.floodRate).toBeCloseTo(FLOOD_BASE, 5);

    for (let i = 0; i < 600; i++) stepAscent(state, DT);
    expect(state.floodRate).toBeCloseTo(FLOOD_BASE, 5);

    climb(state, ctx, 0);
    expect(state.floodRate).toBeCloseTo(FLOOD_BASE * FLOOD_ACCEL, 5);
  });

  it("matches the tuning arithmetic at band four", () => {
    // 0.40 * 1.023^42 should be about 1.04 spacings per second, giving a
    // 120 WPM typist on seven-letter words a little under a second of slack.
    const rate = FLOOD_BASE * FLOOD_ACCEL ** 42;
    expect(rate).toBeGreaterThan(1.0);
    expect(rate).toBeLessThan(1.1);
  });

  it("drowns the climber when the gap closes", () => {
    const { state } = start(["ab"]);
    state.gap = 0.05;
    for (let i = 0; i < 60; i++) stepAscent(state, DT);
    expect(state.drowned).toBe(true);
  });

  it("slows on a perfect word but never reverses", () => {
    // Reverse motion in the periphery under an upward camera is the exact
    // readability failure this design avoids, so relief is a rate change.
    const { state, ctx } = start(["ab"]);
    const before = state.gap;
    climb(state, ctx, 0);
    expect(state.dipMs).toBeGreaterThan(0);
    // The gap never jumped upward on its own.
    expect(state.gap).toBeLessThanOrEqual(before);
  });

  it("caps the banked gap at the visible maximum", () => {
    const { state } = start(["ab"]);
    state.gap = GAP_MAX;
    stepAscent(state, DT);
    expect(state.gap).toBeLessThanOrEqual(GAP_MAX);
  });
});

describe("bands", () => {
  it("changes band every twelve platforms", () => {
    expect(bandForHeight(0)).toBe(1);
    expect(bandForHeight(PLATFORMS_PER_BAND - 1)).toBe(1);
    expect(bandForHeight(PLATFORMS_PER_BAND)).toBe(2);
    expect(bandForHeight(PLATFORMS_PER_BAND * 4)).toBe(5);
  });

  it("reports a band change exactly once, on the boundary", () => {
    const { state, ctx } = start(["ab"]);
    let changes = 0;
    for (let i = 0; i < PLATFORMS_PER_BAND * 2; i++) {
      const platform = active(state);
      if (!platform) break;
      for (const ch of platform.word) {
        const outcome = applyChar(state, ctx, ch, i * 1000);
        if (outcome.kind === "cleared") {
          const result = clearPlatform(state, ctx, outcome.perfect);
          if (result.bandChanged) changes++;
        }
      }
    }
    expect(changes).toBe(2);
  });

  it("caps word length so the leap never becomes rare punctuation", () => {
    // Past eight letters, length only buys seconds per platform and the
    // crouch runs out of resolution to show progress.
    for (let band = 1; band <= 20; band++) {
      const { min, max } = lengthForBand(band);
      expect(max).toBeLessThanOrEqual(MAX_WORD_LENGTH);
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it("places one collectable shield partway through each band", () => {
    const { state, ctx } = start(["ab"]);
    const pickups: number[] = [];
    for (let i = 0; i < PLATFORMS_PER_BAND * 3; i++) {
      for (const platform of state.visible) {
        if (platform.pickup && !pickups.includes(platform.index)) pickups.push(platform.index);
      }
      climb(state, ctx, i * 1000);
    }
    expect(pickups.length).toBeGreaterThanOrEqual(2);
    // One per band, never two in the same one.
    const bands = pickups.map(bandForHeight);
    expect(new Set(bands).size).toBe(bands.length);
  });
});

describe("the leap", () => {
  it("never gates input — typing during the jump is accepted", () => {
    // Without this a 130 WPM typist spends nearly half the run waiting for an
    // animation, which is the single worst thing this mode could do.
    const { state, ctx } = start(["go", "up"]);
    climb(state, ctx, 0);
    expect(state.phase).not.toBe("grounded");

    const outcome = applyChar(state, ctx, "u", 500);
    expect(outcome.kind).toBe("progress");
  });

  it("shortens the airtime when the player types early", () => {
    const { state, ctx } = start(["go", "up"]);
    climb(state, ctx, 0);
    // Move into the air, then type.
    stepAscent(state, 100);
    expect(state.phase).toBe("airborne");
    applyChar(state, ctx, "u", 600);
    expect(state.airtimeCut).toBeGreaterThan(0);
  });

  it("returns to grounded on its own", () => {
    const { state, ctx } = start(["go"]);
    climb(state, ctx, 0);
    for (let i = 0; i < 60; i++) stepAscent(state, DT);
    expect(state.phase).toBe("grounded");
    expect(jumpProgress(state)).toBe(1);
  });
});

describe("determinism", () => {
  /**
   * Plays an explicit script of (time, character) events.
   *
   * The script is fixed, so the only thing a caller varies is how the frames
   * between events are subdivided. An earlier version of this harness derived
   * the keystrokes from the frame loop, which meant chunking the frames also
   * changed how fast the player typed -- it was measuring the harness, not
   * the engine.
   */
  function play(seed: string, script: { at: number; ch: string | null }[], chunk: number) {
    const state = fresh();
    const ctx = ctxWith(["four", "some", "word", "trip"], seed);
    refill(state, ctx);

    let simTime = 0;
    for (const event of script) {
      // Advance to the event in `chunk`-sized groups of fixed steps. Because
      // every step is exactly DT, grouping cannot change the result -- which
      // is the property being asserted.
      while (simTime + DT <= event.at) {
        for (let i = 0; i < chunk && simTime + DT <= event.at; i++) {
          stepAscent(state, DT);
          simTime += DT;
        }
      }

      if (event.ch === null) continue;
      const platform = active(state);
      if (!platform) continue;
      const expected = platform.word[platform.typed];
      const ch = event.ch === "*" ? expected : event.ch;
      if (!ch) continue;
      const outcome = applyChar(state, ctx, ch, event.at);
      if (outcome.kind === "cleared") clearPlatform(state, ctx, outcome.perfect);
    }
    return state;
  }

  /** Correct keys with a wrong one every seventh, so both paths run. */
  const script = Array.from({ length: 400 }, (_, i) => ({
    at: (i + 1) * 120,
    ch: i % 7 === 6 ? "z" : "*",
  }));

  it("produces identical state from the same seed and script", () => {
    expect(JSON.stringify(play("same", script, 1))).toBe(
      JSON.stringify(play("same", script, 1)),
    );
  });

  it("produces different state from different seeds", () => {
    expect(JSON.stringify(play("one", script, 1))).not.toBe(
      JSON.stringify(play("two", script, 1)),
    );
  });

  it("is independent of how the frames between keystrokes are grouped", () => {
    // The bar the radar mode had to clear, and the reason the simulation runs
    // on a fixed timestep: the same elapsed time and the same keystroke times
    // must produce the same state however the frames arrived.
    const smooth = play("pacing", script, 1);
    const bursty = play("pacing", script, 5);
    expect(JSON.stringify(bursty)).toBe(JSON.stringify(smooth));
  });

  it("integrates the flood linearly, so the accumulator cannot drift", () => {
    // One step of 4*DT must equal four steps of DT. If the flood were
    // non-linear in dt, a frame the loop split differently would change the
    // outcome and the fixed timestep would buy nothing.
    const one = fresh();
    const many = fresh();
    stepAscent(one, DT * 4);
    for (let i = 0; i < 4; i++) stepAscent(many, DT);
    expect(one.gap).toBeCloseTo(many.gap, 10);
  });
});

describe("invariants", () => {
  it("hold across many seeds and a long climb", () => {
    for (const seed of ["a1", "zz9", "seed42", "bloom", "0000"]) {
      const state = fresh();
      const ctx = ctxWith(["ab", "four", "signal", "trip", "sea"], seed);
      refill(state, ctx);

      let t = 0;
      for (let i = 0; i < 400; i++) {
        const platform = active(state);
        if (!platform) break;

        t += 120;
        const expected = platform.word[platform.typed];
        const ch = i % 11 === 0 ? "z" : expected;
        if (ch) {
          const outcome = applyChar(state, ctx, ch, t);
          if (outcome.kind === "cleared") clearPlatform(state, ctx, outcome.perfect);
        }
        stepAscent(state, DT);

        expect(state.gap).toBeGreaterThanOrEqual(0);
        expect(state.gap).toBeLessThanOrEqual(GAP_MAX);
        expect(state.shields).toBeGreaterThanOrEqual(0);
        expect(state.shields).toBeLessThanOrEqual(SHIELD_START);
        expect(state.visible).toHaveLength(LOOKAHEAD + 1);
        expect(state.charge).toBeGreaterThanOrEqual(0);
        expect(state.charge).toBeLessThanOrEqual(1);
        // The active platform is always the lowest visible one.
        expect(active(state)?.index).toBe(state.height);
        for (const p of state.visible) {
          expect(p.typed).toBeLessThanOrEqual(p.word.length);
          expect(p.word.length).toBeLessThanOrEqual(MAX_WORD_LENGTH + 8);
        }
        if (state.drowned) break;
      }
    }
  });
});
