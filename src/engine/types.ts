import type { Rng } from "./rng";

/**
 * Engine state.
 *
 * Two rules govern everything in this file and both are load-bearing:
 *
 * 1. NO PIXELS. Entities live in a virtual space where x and y run -1..1 and
 *    z runs 1 (spawn) to 0 (impact). Only the renderer knows about pixels, so
 *    a resize, a fullscreen transition or a DPI change cannot affect the
 *    simulation. That is what makes those events safe.
 *
 * 2. NO REACT, NO DOM, NO WINDOW. This module runs in plain Node under test.
 *    An ESLint boundary enforces it.
 */

export type ModeId = "onslaught" | "sprint" | "zen";

export type GamePhase =
  | "idle"
  | "running"
  | "draft"
  | "paused"
  | "over";

export type TransmissionKind = "normal" | "carrier";

export interface Transmission {
  id: number;
  word: string;
  /** Characters already decoded. */
  typed: number;
  /**
   * Position on the scope, in virtual units the renderer projects.
   *
   *   x  bearing, -1..1, mapped to a full turn
   *   y  radial jitter, -1..1, so contacts at the same bearing do not overlap
   *   z  range: 1 at the rim, 0 when it breaches the perimeter
   *
   * Contacts close on the centre, which is where the player is. That is the
   * whole reading of the screen, and it is why nothing here is in pixels: the
   * renderer owns the projection, so a resize cannot disturb the simulation.
   */
  x: number;
  y: number;
  z: number;
  /** Previous position, for render interpolation between fixed steps. */
  prevX: number;
  prevY: number;
  prevZ: number;
  /** Approach rate in z units per second. */
  speed: number;
  /** Lateral drift, so the field does not look like falling rain. */
  drift: number;
  kind: TransmissionKind;
  status: "alive" | "decoded" | "impacted";
  spawnedAt: number;
}

/**
 * Every tunable the loop reads.
 *
 * Relics change the game by changing these numbers, which is why the loop
 * never needs to know which relics are held.
 */
export interface Stats {
  spawnIntervalMs: number;
  approachSpeed: number;
  maxLive: number;
  comboCap: number;
  /** Combo decays after this long without a decode. 0 disables decay. */
  comboDecayMs: number;
  maxShields: number;
  waveDurationMs: number;
  /** Time added to the wave clock for a word decoded without a mistake. */
  perfectBonusMs: number;
  scoreMultiplier: number;
  /** Bias toward longer words: 0 neutral, 1 always the longest available. */
  lengthBias: number;
  /** Shields refunded when a mistyped character is corrected. */
  shieldOnCorrection: number;
  /** Probability that a decoded transmission drops a shield. */
  shieldDropChance: number;
}

export const BASE_STATS: Stats = {
  spawnIntervalMs: 1150,
  approachSpeed: 0.048,
  maxLive: 7,
  comboCap: 50,
  comboDecayMs: 4000,
  maxShields: 3,
  waveDurationMs: 45_000,
  perfectBonusMs: 400,
  scoreMultiplier: 1,
  lengthBias: 0,
  shieldOnCorrection: 0,
  shieldDropChance: 0,
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

  wave: number;
  waveClock: number;

  entities: Transmission[];
  /** The transmission the player has locked onto, if any. */
  activeId: number | null;

  combo: number;
  comboBest: number;
  /** Time since the last decode, for combo decay. */
  comboIdleMs: number;
  shields: number;
  score: number;

  decoded: number;
  impacted: number;
  /** Transmissions decoded without a single mistyped character. */
  perfect: number;

  stats: Stats;
  relics: OwnedRelic[];
  draft: string[] | null;

  nextEntityId: number;
  spawnTimer: number;
  /** Words remaining in this wave's budget. */
  spawnBudget: number;
}

export interface EngineContext {
  rngSpawn: Rng;
  rngWords: Rng;
  rngDraft: Rng;
  rngEffect: Rng;
  /** Draws the next word, honouring `lengthBias`. */
  drawWord: (bias: number) => string;
}

/** Everything the loop can emit. Relics subscribe to these. */
export type EngineEvent =
  | { type: "spawn"; entity: Transmission }
  | { type: "lock"; entity: Transmission }
  | { type: "keystroke"; correct: boolean; entityId: number | null }
  | { type: "mistype"; entityId: number | null; expected: string; actual: string }
  | { type: "correction"; entityId: number | null }
  | { type: "decoded"; entity: Transmission; perfect: boolean; ms: number }
  | { type: "impact"; entity: Transmission; shieldsLeft: number }
  | { type: "waveStart"; wave: number }
  | { type: "waveEnd"; wave: number; cleared: boolean }
  | { type: "gameOver"; score: number; wave: number }
  | { type: "comboBreak"; at: number }
  | { type: "shieldGained"; total: number }
  | { type: "tick"; dt: number };

export type EngineEventType = EngineEvent["type"];
