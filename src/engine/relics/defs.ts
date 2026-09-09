import type { RelicDef } from "./types";

/**
 * The relic pool.
 *
 * Each entry is self-contained: to add one, append an object here and add a
 * behaviour test. Nothing else in the engine needs to change.
 *
 * Naming follows the fiction — these are salvaged instruments from a signal
 * array, not "upgrades" — and each blurb says exactly what changes in
 * concrete terms, because a relic whose effect the player has to guess at is
 * not a choice, it is a coin flip.
 *
 * A note on where the interesting ones live. `Stats` makes "+10% of a number"
 * the path of least resistance, and a pool made only of those is a pool of
 * sliders. The relics worth drafting change the *contract*: what a mistake
 * costs, whether the flood moves while you are mid-word, whether a word
 * repeats. Those are the ones with hooks.
 */
export const RELICS: RelicDef[] = [
  // ---- stat relics: pure modifiers, no hooks, zero loop cost -------------
  {
    id: "reinforced-hull",
    name: "Reinforced Hull",
    blurb: "Carry one more shield.",
    rarity: "common",
    maxStacks: 3,
    modifiers: (stacks) => [{ stat: "maxShields", op: "add", value: stacks }],
  },
  {
    id: "narrow-band",
    name: "Narrow Band",
    blurb: "The flood rises 15% slower.",
    rarity: "rare",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "floodRise", op: "mul", value: 0.85 ** stacks }],
  },
  {
    id: "deep-keel",
    name: "Deep Keel",
    blurb: "The flood speeds up more gently as you climb.",
    rarity: "epic",
    maxStacks: 1,
    minBand: 2,
    // The single strongest effect in the pool, because the per-platform
    // acceleration is what actually ends runs.
    modifiers: () => [{ stat: "floodAccel", op: "mul", value: 0.992 }],
  },
  {
    id: "wide-cistern",
    name: "Wide Cistern",
    blurb: "You can bank more distance ahead of the flood.",
    rarity: "common",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "gapMax", op: "add", value: 0.4 * stacks }],
  },
  {
    id: "soft-hull",
    name: "Soft Hull",
    blurb: "Mistakes cost 40% less distance.",
    rarity: "rare",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "errorCost", op: "mul", value: 0.6 ** stacks }],
  },
  {
    id: "wide-aperture",
    name: "Wide Aperture",
    blurb: "Your combo can climb to 80 instead of 50.",
    rarity: "common",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "comboCap", op: "add", value: 30 * stacks }],
  },
  {
    id: "deep-field",
    name: "Deep Field",
    blurb: "Longer words appear more often, and every platform scores 25% more.",
    rarity: "rare",
    maxStacks: 2,
    modifiers: (stacks) => [
      { stat: "lengthBias", op: "add", value: 0.4 * stacks },
      { stat: "scoreMultiplier", op: "mul", value: 1.25 ** stacks },
    ],
  },
  {
    id: "long-relief",
    name: "Long Relief",
    blurb: "A perfect word slows the flood for twice as long.",
    rarity: "common",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "perfectDipMs", op: "mul", value: 1 + stacks }],
  },
  {
    id: "still-water",
    name: "Still Water",
    blurb: "A perfect word slows the flood much further.",
    rarity: "rare",
    maxStacks: 1,
    modifiers: () => [{ stat: "perfectDipFactor", op: "mul", value: 0.6 }],
  },

  // ---- hook relics: behaviour that stats cannot express -----------------
  {
    id: "bilge-pump",
    name: "Bilge Pump",
    blurb: "A perfect word pushes the flood back down instead of just slowing it.",
    rarity: "epic",
    maxStacks: 2,
    minBand: 2,
    // The one relic allowed to break the no-reverse-motion rule, which is
    // exactly why it feels like a find.
    hooks: {
      cleared: (api, event, stacks) => {
        if (event.perfect) api.pushFlood(0.12 * stacks);
      },
    },
  },
  {
    id: "salvage-array",
    name: "Salvage Array",
    blurb: "Losing a shield pushes the flood down a little.",
    rarity: "rare",
    maxStacks: 2,
    hooks: {
      shieldLost: (api, _event, stacks) => {
        api.pushFlood(0.06 * stacks);
      },
    },
  },
  {
    id: "momentum-cell",
    name: "Momentum Cell",
    blurb: "A perfect word advances your combo by two instead of one.",
    rarity: "rare",
    maxStacks: 2,
    hooks: {
      cleared: (api, event, stacks) => {
        if (event.perfect) api.addCombo(stacks);
      },
    },
  },
  {
    id: "soft-landing",
    name: "Soft Landing",
    blurb: "A broken combo drops to a third instead of to zero.",
    rarity: "epic",
    maxStacks: 1,
    minBand: 2,
    priority: 10,
    hooks: {
      comboBreak: (api, event) => {
        api.setCombo(Math.floor(event.at / 3));
      },
    },
  },
  {
    id: "long-baseline",
    name: "Long Baseline",
    blurb: "Longer words score more.",
    rarity: "common",
    maxStacks: 2,
    hooks: {
      cleared: (api, event, stacks) => {
        api.addScore(event.word.length * 2 * stacks);
      },
    },
  },
  {
    id: "held-breath",
    name: "Held Breath",
    blurb: "The flood stops rising while you are partway through a word.",
    rarity: "epic",
    maxStacks: 1,
    minBand: 3,
    // Changes the game from continuous pressure to turn-based pressure with
    // one flag. Read by the loop rather than applied here.
    hooks: {
      progress: (api) => {
        api.pushFlood(0);
      },
    },
  },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
);
