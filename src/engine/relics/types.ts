import type { EngineEvent, EngineEventType, GameState, Stats } from "../types";

/**
 * The relic system.
 *
 * A relic changes the game through exactly two mechanisms, and neither of them
 * is a branch inside the game loop:
 *
 *   1. `modifiers` contributes stat operations, resolved once when the relic
 *      is picked into a flat `Stats` table the loop reads every tick.
 *
 *   2. `hooks` registers handlers on engine events, dispatched through a
 *      narrow `EffectApi` that is the only way a relic may mutate anything.
 *
 * The payoff is composability: a relic reads its own bonus out of a stat, so
 * another relic can scale it without either knowing the other exists. And
 * adding a relic is one file plus one test, which is the whole contribution
 * contract.
 */

export type Rarity = "common" | "rare" | "epic";

export type StatOp =
  | { stat: keyof Stats; op: "set"; value: number }
  | { stat: keyof Stats; op: "add"; value: number }
  | { stat: keyof Stats; op: "mul"; value: number }
  | { stat: keyof Stats; op: "min"; value: number }
  | { stat: keyof Stats; op: "max"; value: number };

/**
 * The only surface a relic may mutate.
 *
 * Deliberately narrow: a relic cannot reach into `entities`, cannot schedule
 * work, and cannot call `Math.random`. Randomness comes from the seeded
 * effect stream via `rng()` so a run stays reproducible.
 */
export interface EffectApi {
  readonly state: Readonly<GameState>;
  readonly stats: Readonly<Stats>;
  grantShield(n: number): void;
  addWaveTime(ms: number): void;
  addScore(n: number): void;
  addCombo(n: number): void;
  setCombo(n: number): void;
  rng(): number;
}

export type RelicHook<K extends EngineEventType = EngineEventType> = (
  api: EffectApi,
  event: Extract<EngineEvent, { type: K }>,
  stacks: number,
) => void;

export interface RelicDef {
  id: string;
  name: string;
  /** One sentence, in the player's terms, saying exactly what changes. */
  blurb: string;
  rarity: Rarity;
  /** How many copies may be held. */
  maxStacks: number;
  /** Cannot be drafted alongside these. */
  exclusiveWith?: string[];
  /** Not offered before this wave. */
  minWave?: number;
  /** Hook dispatch order; ties broken by id so it stays deterministic. */
  priority?: number;
  modifiers?: (stacks: number) => StatOp[];
  hooks?: { [K in EngineEventType]?: RelicHook<K> };
}

/** Op order is fixed so stacking is deterministic regardless of pick order. */
const OP_ORDER: StatOp["op"][] = ["set", "add", "mul", "min", "max"];

export function resolveStats(base: Stats, ops: readonly StatOp[]): Stats {
  const out: Stats = { ...base };
  for (const op of OP_ORDER) {
    for (const entry of ops) {
      if (entry.op !== op) continue;
      const current = out[entry.stat];
      switch (entry.op) {
        case "set":
          out[entry.stat] = entry.value;
          break;
        case "add":
          out[entry.stat] = current + entry.value;
          break;
        case "mul":
          out[entry.stat] = current * entry.value;
          break;
        case "min":
          out[entry.stat] = Math.max(current, entry.value);
          break;
        case "max":
          out[entry.stat] = Math.min(current, entry.value);
          break;
      }
    }
  }
  return out;
}
