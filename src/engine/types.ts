import type { Rng } from "./rng";
import type { AscentState } from "./modes/ascent";

/**
 * Engine state.
 *
 * Two rules govern everything in this file and both are load-bearing:
 *
 * 1. NO PIXELS. The world is measured in platform spacings and milliseconds.
 *    Only the renderer knows about pixels, so a resize, a fullscreen
 *    transition or a DPI change cannot affect the simulation. That is what
 *    makes those events safe.
 *
 * 2. NO REACT, NO DOM, NO WINDOW. This module runs in plain Node under test,
 *    and `eslint.config.mjs` has a `no-restricted-imports` rule that enforces
 *    it at lint time as well.
 */

export type ModeId = "ascent" | "sprint" | "zen";

export type GamePhase =
  | "idle"
  | "running"
  | "draft"
  | "paused"
  | "over";

/**
 * Every tunable the loop reads.
 *
 * Relics change the game by changing these numbers, which is why the loop
 * never needs to know which relics are held. Every field is in the engine's
 * own units -- platform spacings and milliseconds -- never pixels.
 */
export interface Stats {
  /** Flood speed at the start, in platform spacings per second. */
  floodRise: number;
  /** Flood speed multiplier per platform cleared. */
  floodAccel: number;
  /** The most gap the player can bank, in spacings. */
  gapMax: number;
  /** What one charged error costs, in spacings. */
  errorCost: number;

  maxShields: number;
  /** Probability a band's pickup platform actually carries a shield. */
  shieldDropChance: number;

  comboCap: number;
  /** How long a perfect word's flood dip lasts. */
  perfectDipMs: number;
  /** How much a perfect word slows the flood. Below 1. */
  perfectDipFactor: number;

  scoreMultiplier: number;
  /** Bias toward longer words: 0 neutral, 1 always the longest available. */
  lengthBias: number;
  /** Airtime for a leap, in milliseconds. */
  jumpMs: number;
}

export const BASE_STATS: Stats = {
  floodRise: 0.4,
  floodAccel: 1.023,
  gapMax: 2.5,
  errorCost: 0.08,
  maxShields: 3,
  shieldDropChance: 1,
  comboCap: 50,
  perfectDipMs: 900,
  perfectDipFactor: 0.82,
  scoreMultiplier: 1,
  lengthBias: 0,
  jumpMs: 260,
};

export interface OwnedRelic {
  id: string;
  stacks: number;
}

export interface GameState {
  mode: ModeId;
  seed: string;
  phase: GamePhase;

  /** Simulated time in ms, advanced only by fixed steps. */
  simTime: number;
  /** Wall time spent paused, excluded from every metric. */
  pausedMs: number;

  /**
   * The climb. Only present in Ascent; the timed modes leave it null so the
   * loop can skip the whole thing rather than iterating an empty world.
   */
  ascent: AscentState | null;

  stats: Stats;
  relics: OwnedRelic[];
  draft: string[] | null;
}

export interface EngineContext {
  rngSpawn: Rng;
  rngWords: Rng;
  rngDraft: Rng;
  rngEffect: Rng;
  /**
   * Draws the word for a platform.
   *
   * Takes the platform index as well as the band so the chooser can look at
   * where in the climb it is -- which is what lets it bias toward the
   * player's own problem bigrams two platforms ahead of where they are.
   */
  drawWord: (band: number, index: number, bias: number) => string;
}

/** Everything the loop can emit. Relics subscribe to these. */
export type EngineEvent =
  | { type: "keystroke"; correct: boolean }
  | { type: "progress"; word: string; typed: number }
  | { type: "mistype"; expected: string; actual: string; charged: boolean; hint: boolean }
  | { type: "skipped"; expected: string }
  | { type: "cleared"; word: string; perfect: boolean; height: number }
  | { type: "bandStart"; band: number }
  | { type: "shieldLost"; remaining: number }
  | { type: "shieldGained"; total: number }
  | { type: "drowned"; height: number; score: number }
  | { type: "gameOver"; score: number; height: number }
  | { type: "comboBreak"; at: number }
  | { type: "tick"; dt: number };

export type EngineEventType = EngineEvent["type"];
