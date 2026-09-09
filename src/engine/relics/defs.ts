import type { RelicDef } from "./types";

/**
 * The relic pool.
 *
 * Each entry is self-contained: to add one, append an object here and add a
 * behaviour test. Nothing else in the engine needs to change.
 *
 * Naming and wording follow the fiction — these are salvaged instruments at a
 * listening post, not "upgrades" — and each blurb says exactly what changes in
 * concrete terms, because a relic whose effect the player has to guess at is
 * not a choice, it is a coin flip.
 */
export const RELICS: RelicDef[] = [
  // ---- stat relics: pure modifiers, no hooks, zero loop cost -------------
  {
    id: "wide-aperture",
    name: "Wide Aperture",
    blurb: "Your combo can climb to 80 instead of 50.",
    rarity: "common",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "comboCap", op: "add", value: 30 * stacks }],
  },
  {
    id: "cold-storage",
    name: "Cold Storage",
    blurb: "Your combo takes twice as long to decay.",
    rarity: "common",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "comboDecayMs", op: "mul", value: 1 + stacks }],
  },
  {
    id: "reinforced-hull",
    name: "Reinforced Hull",
    blurb: "Start each run with one more shield.",
    rarity: "rare",
    maxStacks: 3,
    modifiers: (stacks) => [{ stat: "maxShields", op: "add", value: stacks }],
  },
  {
    id: "narrow-band",
    name: "Narrow Band",
    blurb: "Transmissions arrive 15% slower.",
    rarity: "rare",
    maxStacks: 2,
    modifiers: (stacks) => [{ stat: "approachSpeed", op: "mul", value: 0.85 ** stacks }],
  },
  {
    id: "deep-field",
    name: "Deep Field",
    blurb: "Longer words appear more often, and every decode scores 25% more.",
    rarity: "rare",
    maxStacks: 2,
    modifiers: (stacks) => [
      { stat: "lengthBias", op: "add", value: 0.4 * stacks },
      { stat: "scoreMultiplier", op: "mul", value: 1.25 ** stacks },
    ],
  },
  {
    id: "quiet-sector",
    name: "Quiet Sector",
    blurb: "At most four transmissions at once, but they arrive sooner.",
    rarity: "common",
    maxStacks: 1,
    exclusiveWith: ["swarm-protocol"],
    modifiers: () => [
      { stat: "maxLive", op: "max", value: 4 },
      { stat: "spawnIntervalMs", op: "mul", value: 0.8 },
    ],
  },
  {
    id: "swarm-protocol",
    name: "Swarm Protocol",
    blurb: "Three more transmissions at once, and double score.",
    rarity: "epic",
    maxStacks: 1,
    minWave: 4,
    exclusiveWith: ["quiet-sector"],
    modifiers: () => [
      { stat: "maxLive", op: "add", value: 3 },
      { stat: "scoreMultiplier", op: "mul", value: 2 },
    ],
  },

  // ---- hook relics: behaviour that stats cannot express -----------------
  {
    id: "phase-lock",
    name: "Phase Lock",
    blurb: "Fixing a mistyped character restores a shield.",
    rarity: "epic",
    maxStacks: 1,
    minWave: 3,
    modifiers: () => [{ stat: "shieldOnCorrection", op: "add", value: 1 }],
    hooks: {
      correction: (api) => {
        api.grantShield(api.stats.shieldOnCorrection);
      },
    },
  },
  {
    id: "clean-signal",
    name: "Clean Signal",
    blurb: "Decoding a word with no mistakes adds time to the wave clock.",
    rarity: "common",
    maxStacks: 3,
    // The bonus is read from a stat, so stacking this relic — or any future
    // relic that scales perfectBonusMs — compounds correctly without either
    // of them knowing about the other.
    modifiers: (stacks) => [{ stat: "perfectBonusMs", op: "mul", value: 1 + 0.75 * stacks }],
    hooks: {
      decoded: (api, event) => {
        if (event.perfect) api.addWaveTime(api.stats.perfectBonusMs);
      },
    },
  },
  {
    id: "salvage-array",
    name: "Salvage Array",
    blurb: "Every carrier you decode leaves a shield behind.",
    rarity: "rare",
    maxStacks: 2,
    hooks: {
      decoded: (api, event, stacks) => {
        if (event.entity.kind === "carrier") api.grantShield(stacks);
      },
    },
  },
  {
    id: "momentum-cell",
    name: "Momentum Cell",
    blurb: "A perfect decode advances your combo by two instead of one.",
    rarity: "rare",
    maxStacks: 2,
    hooks: {
      decoded: (api, event, stacks) => {
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
    minWave: 2,
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
    blurb: "Score scales with the length of the word you decoded.",
    rarity: "common",
    maxStacks: 2,
    hooks: {
      decoded: (api, event, stacks) => {
        api.addScore(event.entity.word.length * 2 * stacks);
      },
    },
  },
  {
    id: "dead-reckoning",
    name: "Dead Reckoning",
    blurb: "Losing a shield grants 15 seconds of wave time.",
    rarity: "common",
    maxStacks: 2,
    hooks: {
      impact: (api, _event, stacks) => {
        api.addWaveTime(15_000 * stacks);
      },
    },
  },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
);
