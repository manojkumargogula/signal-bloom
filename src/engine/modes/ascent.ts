import { clamp } from "@/lib/math";
import { PLATFORMS_PER_BAND } from "@/data/bands";
import type { Rng } from "../rng";

/**
 * Ascent: the climb.
 *
 * A climber stands on a platform. The platform above carries a word. Type it
 * and the climber leaps up to it. A flood rises from below and speeds up with
 * every platform cleared — that is the only way to die.
 *
 * Everything here is measured in **platform spacings** (S), never pixels. The
 * renderer owns the projection, so a resize, a fullscreen transition or a DPI
 * change cannot disturb the simulation. This module also touches no DOM and
 * no `window`, which the ESLint boundary and the node test environment both
 * enforce.
 *
 * ## Why there is only one fail state
 *
 * The obvious design gives the player hearts AND a rising flood. The
 * arithmetic kills it: at four-letter words and 92% accuracy, errors run
 * about 0.32 per platform, so eight hearts lasts roughly 25 platforms — and
 * the flood catches that same player at roughly 26. Which one ends the run is
 * decided by noise, and the player has no way to tell which system did it.
 *
 * So the flood is the only wall, and accuracy feeds it: a charged error
 * costs a fixed slice of the gap. Speed and accuracy end up denominated in
 * the same currency, distance from the water, which is on screen at all
 * times. Shields absorb an error's impulse and are the countable accuracy
 * budget, but running out of them does not end anything by itself.
 */

/** How fast the flood rises at the start, in platform spacings per second. */
export const FLOOD_BASE = 0.4;

/**
 * Flood acceleration per platform cleared.
 *
 * Per *platform*, deliberately not per second. That way a slow player never
 * meets a fast flood — the flood is fast because you climbed, not because
 * time passed — and one curve serves every skill level.
 *
 * The value controls how long a run lasts, and it is surprisingly sensitive:
 * 1.5% gives flabby 60-80 second runs, 3.5% gives brutal 30 second ones.
 * At 2.3% a 40 WPM player and a 120 WPM player both last around 45 seconds
 * while reaching very different heights, so pacing stays stable across the
 * whole player base and score does the differentiating.
 */
export const FLOOD_ACCEL = 1.023;

/** The gap the climb starts with, in spacings. */
export const GAP_START = 2;

/**
 * How much clearance one platform buys.
 *
 * One spacing, because that is literally how far the climber moved. Without
 * this the flood only ever subtracts and the gap falls monotonically, so
 * every player drowns within seconds no matter how fast they type -- the
 * entire tension of the mode is the race between this and the flood rate.
 * It shipped missing once and the browser gave no hint, because the game was
 * still playable, scored and drafted; only simulating a 40 WPM and a 120 WPM
 * typist against the real numbers exposed it.
 */
export const CLIMB_GAIN = 1;

/**
 * The most gap the player can bank.
 *
 * Not arbitrary: this is the distance at which the flood surface sits on the
 * bottom edge of the screen. Capping the gap at visibility means the fail
 * state is legible at all times without needing an off-screen indicator.
 */
export const GAP_MAX = 2.5;

/** What one charged error costs, in spacings. Twelve of them is a full gap. */
export const ERROR_COST = 0.08;

/** A perfect word slows the flood by this factor... */
export const PERFECT_DIP = 0.82;

/** ...decaying back to normal over this long. */
export const PERFECT_DIP_MS = 900;

/** Charged errors allowed on one platform before the rest are free. */
export const MAX_CHARGED_PER_WORD = 3;

/** A repeat of the same wrong key inside this window is motor stutter, not a decision. */
export const SAME_KEY_GRACE_MS = 250;

/** Charged errors allowed per second, which also caps the error flash rate. */
export const MAX_CHARGED_PER_SECOND = 4;

/** Errors on one character before the player is shown which finger to use. */
export const HINT_AFTER = 3;

/** Errors on one character before it is given away, to prevent a softlock. */
export const SKIP_AFTER = 6;

export const JUMP_MS = 260;
export const ANTICIPATION_MS = 70;

/** How far the flood is pushed back when a shield absorbs an error. */
export const SHIELD_START = 3;
export const SHIELD_MAX = 3;

export type ClimberPhase = "grounded" | "anticipating" | "airborne";

export interface Platform {
  /** Dense from 0, so it indexes the target list the analytics layer wants. */
  index: number;
  word: string;
  /** Characters decoded so far. */
  typed: number;
  /** Charged errors on this platform, for the per-word cap. */
  charged: number;
  /** True once the player left it without a single mistake. */
  perfect: boolean;
  /** Lateral offset in spacings, so the climb is not a vertical elevator. */
  offset: number;
  /** Carries a shield the player collects by clearing it perfectly. */
  pickup: boolean;
}

export interface AscentState {
  /** Platforms cleared. Also the score's height component. */
  height: number;
  band: number;

  /** The platform being typed, plus the ones visible above it. */
  visible: Platform[];

  /** Distance from the climber to the flood, in spacings. */
  gap: number;
  /** Current flood speed, before the perfect-word dip. */
  floodRate: number;
  /** Remaining milliseconds of the dip a perfect word applied. */
  dipMs: number;

  shields: number;

  phase: ClimberPhase;
  /** Milliseconds elapsed in the current phase. */
  phaseMs: number;
  /** How much of the airtime to skip, earned by typing early. */
  airtimeCut: number;

  /** 0..1 across the active word, what the crouch depth is driven by. */
  charge: number;

  combo: number;
  comboBest: number;
  score: number;

  /** Errors on the current character, for the hint and the softlock escape. */
  charErrors: number;
  /** The last wrong key and when, for the same-key grace window. */
  lastWrongKey: string | null;
  lastWrongAt: number;
  /** Timestamps of recent charged errors, for the per-second limit. */
  chargedAt: number[];

  /** Set when the flood catches the climber. */
  drowned: boolean;
}

export function createAscentState(): AscentState {
  return {
    height: 0,
    band: 1,
    visible: [],
    gap: GAP_START,
    floodRate: FLOOD_BASE,
    dipMs: 0,
    shields: SHIELD_START,
    phase: "grounded",
    phaseMs: 0,
    airtimeCut: 0,
    charge: 0,
    combo: 0,
    comboBest: 0,
    score: 0,
    charErrors: 0,
    lastWrongKey: null,
    lastWrongAt: 0,
    chargedAt: [],
    drowned: false,
  };
}

/** The band a given height falls in. */
export function bandForHeight(height: number): number {
  return Math.floor(height / PLATFORMS_PER_BAND) + 1;
}

/**
 * Word length for a band.
 *
 * Capped at 8. Beyond that, length only buys more seconds per platform, which
 * makes the leap rare punctuation instead of a per-word reward — and the
 * crouch runs out of resolution to show progress. Difficulty past band 6
 * comes from harder letter combinations instead, which is also the thing the
 * analytics layer can actually measure.
 */
export function lengthForBand(band: number): { min: number; max: number } {
  const base = 2 + band;
  return { min: Math.min(base, 8), max: Math.min(base + 1, 8) };
}

export const MAX_WORD_LENGTH = 8;

/** How many platforms are visible above the active one. */
export const LOOKAHEAD = 3;

export interface AscentContext {
  /** Draws a word for a band. Owned by the engine so it can bias by weakness. */
  drawWord: (band: number, index: number) => string;
  rng: Rng;
}

/** Fills the visible stack up to the lookahead. */
export function refill(state: AscentState, ctx: AscentContext): void {
  while (state.visible.length < LOOKAHEAD + 1) {
    const index = state.height + state.visible.length;
    const band = bandForHeight(index);
    state.visible.push({
      index,
      word: ctx.drawWord(band, index),
      typed: 0,
      charged: 0,
      perfect: true,
      // Alternating sides, so the climb reads as a route rather than a ladder.
      offset: (index % 2 === 0 ? 1 : -1) * ctx.rng.range(0.12, 0.3),
      // One shield per band, on a platform partway through it. Collected by
      // clearing that platform perfectly, so it is a skill check rather than
      // something that lands in your lap.
      pickup: index > 0 && index % PLATFORMS_PER_BAND === PLATFORMS_PER_BAND - 4,
    });
  }
}

/** The platform currently being typed. */
export function active(state: AscentState): Platform | null {
  return state.visible[0] ?? null;
}

export type AscentOutcome =
  | { kind: "progress"; platform: Platform }
  | { kind: "cleared"; platform: Platform; perfect: boolean }
  | { kind: "error"; platform: Platform; charged: boolean; expected: string; hint: boolean }
  | { kind: "skipped"; platform: Platform; expected: string }
  | { kind: "ignored" };

/**
 * Applies one produced character.
 *
 * Runs synchronously from the input handler, and deliberately **not** gated on
 * the jump animation. Typing a five-letter word takes about a second at
 * 60 WPM and under half of one at 130 WPM, so a jump the player has to wait
 * out would be nearly half the cycle for a fast typist. Keystrokes for the
 * next word are accepted from the first frame of the leap; the climber lands
 * while the player is already typing again, and typing early shortens the
 * remaining airtime rather than being dropped.
 */
export function applyChar(
  state: AscentState,
  ctx: AscentContext,
  char: string,
  now: number,
): AscentOutcome {
  const platform = active(state);
  if (!platform) return { kind: "ignored" };

  const expected = platform.word[platform.typed];
  if (expected === undefined) return { kind: "ignored" };

  if (char === expected) {
    platform.typed++;
    state.charErrors = 0;
    state.lastWrongKey = null;
    state.charge = platform.typed / platform.word.length;

    // Typing into the leap buys back airtime, up to 40% of it.
    if (state.phase === "airborne") {
      state.airtimeCut = Math.min(0.4, state.airtimeCut + 0.15);
    }

    if (platform.typed >= platform.word.length) {
      return { kind: "cleared", platform, perfect: platform.perfect };
    }
    return { kind: "progress", platform };
  }

  // ---- a wrong character -------------------------------------------------
  platform.perfect = false;
  state.charErrors++;

  // Softlock escape. A player who cannot produce this character at all — the
  // wrong keyboard layout, a dead key, a missing glyph — would otherwise be
  // stuck until the flood took them, with nothing telling them why.
  if (state.charErrors >= SKIP_AFTER) {
    platform.typed++;
    state.charErrors = 0;
    state.combo = 0;
    state.charge = platform.typed / platform.word.length;
    if (platform.typed >= platform.word.length) {
      return { kind: "cleared", platform, perfect: false };
    }
    return { kind: "skipped", platform, expected };
  }

  const charged = shouldCharge(state, char, now);
  if (charged) {
    state.chargedAt.push(now);
    platform.charged++;
    state.combo = 0;

    // A shield absorbs the impulse. Running out of shields does not end the
    // run on its own; it just means errors start costing distance.
    if (state.shields > 0) {
      state.shields--;
    } else {
      // Later errors on one word cost less, so a single hard word cannot
      // spiral a run into the water.
      const decay = [1, 0.6, 0.4][Math.min(platform.charged - 1, 2)] ?? 0.4;
      state.gap = Math.max(0, state.gap - ERROR_COST * decay);
    }
  }

  state.lastWrongKey = char;
  state.lastWrongAt = now;

  return {
    kind: "error",
    platform,
    charged,
    expected,
    hint: state.charErrors >= HINT_AFTER,
  };
}

/**
 * Whether an error costs anything.
 *
 * Three guards, none of them an input cooldown — a cooldown would make correct
 * fast typing feel unresponsive in exactly the moment after a mistake, which
 * is when responsiveness matters most.
 */
function shouldCharge(state: AscentState, char: string, now: number): boolean {
  // Hammering the same wrong key is motor stutter, not repeated decisions.
  if (state.lastWrongKey === char && now - state.lastWrongAt < SAME_KEY_GRACE_MS) {
    return false;
  }

  const platform = active(state);
  if (platform && platform.charged >= MAX_CHARGED_PER_WORD) return false;

  // A global rate limit, which doubles as the WCAG 2.3.1 flash cap.
  state.chargedAt = state.chargedAt.filter((t) => now - t < 1000);
  if (state.chargedAt.length >= MAX_CHARGED_PER_SECOND) return false;

  return true;
}

/** Commits a cleared platform: advances the climber and starts the leap. */
export function clearPlatform(
  state: AscentState,
  ctx: AscentContext,
  perfect: boolean,
): { bandChanged: boolean; shieldGained: boolean } {
  const platform = state.visible.shift();
  if (!platform) return { bandChanged: false, shieldGained: false };

  state.height++;
  // The climber moved a platform, so it gained a platform of clearance. This
  // is the other half of the race; the flood is only one side of it.
  state.gap = Math.min(state.gap + CLIMB_GAIN, GAP_MAX);
  state.charge = 0;
  state.charErrors = 0;
  state.phase = "anticipating";
  state.phaseMs = 0;
  state.airtimeCut = 0;

  // The flood accelerates because the player climbed, never because time
  // passed. That is what lets one curve serve every skill level.
  state.floodRate = FLOOD_BASE * FLOOD_ACCEL ** state.height;

  // A perfect word slows the flood; it never pushes it back down. Reverse
  // motion in the periphery under an upward-scrolling camera is the exact
  // readability failure this whole design is built to avoid, and it turns the
  // threat into a yo-yo. Slowing reads as relief and adds no new motion.
  if (perfect) {
    state.dipMs = PERFECT_DIP_MS;
    state.combo++;
    state.comboBest = Math.max(state.comboBest, state.combo);
  }

  let shieldGained = false;
  if (platform.pickup && perfect && state.shields < SHIELD_MAX) {
    state.shields++;
    shieldGained = true;
  }

  // Two terms, not four. Height plus one multiplier is a score a player can
  // actually feel; a length bonus is nearly redundant with height.
  state.score += Math.round(10 * (1 + 0.05 * Math.min(state.combo, 20)));

  const band = bandForHeight(state.height);
  const bandChanged = band !== state.band;
  state.band = band;

  refill(state, ctx);
  return { bandChanged, shieldGained };
}

/** Advances the flood and the climber by one fixed step. */
export function stepAscent(state: AscentState, dtMs: number): void {
  const seconds = dtMs / 1000;

  // ---- the climber's phase machine ---------------------------------------
  state.phaseMs += dtMs;
  if (state.phase === "anticipating" && state.phaseMs >= ANTICIPATION_MS) {
    state.phase = "airborne";
    state.phaseMs -= ANTICIPATION_MS;
  }
  if (state.phase === "airborne") {
    const airtime = JUMP_MS * (1 - state.airtimeCut);
    if (state.phaseMs >= airtime) {
      state.phase = "grounded";
      state.phaseMs = 0;
      state.airtimeCut = 0;
    }
  }

  // ---- the flood ---------------------------------------------------------
  let rate = state.floodRate;
  if (state.dipMs > 0) {
    state.dipMs = Math.max(0, state.dipMs - dtMs);
    rate *= PERFECT_DIP;
  }

  state.gap = clamp(state.gap - rate * seconds, 0, GAP_MAX);
  if (state.gap <= 0) state.drowned = true;
}

/** Where the climber is, 0..1 through its leap, for the renderer to shape. */
export function jumpProgress(state: AscentState): number {
  if (state.phase !== "airborne") return state.phase === "anticipating" ? 0 : 1;
  const airtime = JUMP_MS * (1 - state.airtimeCut);
  return clamp(state.phaseMs / airtime, 0, 1);
}
