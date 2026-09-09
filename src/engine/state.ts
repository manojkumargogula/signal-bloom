import { getCorpus } from "@/data";
import { bandForHeight, createAscentState, lengthForBand } from "./modes/ascent";
import { makeRng } from "./rng";
import { RelicRuntime } from "./relics/runtime";
import { BASE_STATS, type EngineContext, type GameState, type ModeId } from "./types";

export interface RunConfig {
  mode: ModeId;
  seed: string;
  corpusId: string;
  /** Sprint only: run length. Ignored by Ascent and Zen. */
  durationMs?: number;
  /** Sprint only: fixed word count instead of a duration. */
  wordCount?: number;
}

export function createState(config: RunConfig): GameState {
  return {
    mode: config.mode,
    seed: config.seed,
    phase: "idle",
    simTime: 0,
    pausedMs: 0,
    ascent: config.mode === "ascent" ? createAscentState() : null,
    stats: { ...BASE_STATS },
    relics: [],
    draft: null,
  };
}

/**
 * How a word is chosen for a platform.
 *
 * Length comes from the band, and within that band the choice is weighted by
 * `bias`, which the engine raises when it wants to target the player's own
 * problem bigrams. Drawing from a shuffled bag rather than sampling
 * independently is what stops the same word appearing twice in a row, which
 * players read as a bug rather than as randomness.
 */
export function createContext(config: RunConfig): EngineContext {
  const corpus = getCorpus(config.corpusId);
  const rngWords = makeRng(config.seed, "words");
  const pool = corpus.words.length > 0 ? corpus.words : ["signal"];

  /** Words grouped by length, so a band can ask for what it needs. */
  const byLength = new Map<number, string[]>();
  for (const word of pool) {
    const list = byLength.get(word.length);
    if (list) list.push(word);
    else byLength.set(word.length, [word]);
  }

  /** Single letters, because the corpus has almost none and the climb opens with them. */
  const letters = "asdfghjklqwertyuiopzxcvbnm".split("");

  const pick = (min: number, max: number, bias: number): string => {
    const candidates: string[] = [];
    for (let len = min; len <= max; len++) {
      const list = byLength.get(len);
      if (list) candidates.push(...list);
    }
    if (candidates.length === 0) return rngWords.pick(pool);

    // Length bias draws a few and keeps the longest, the same trick the radar
    // spawner used.
    const draws = 1 + Math.round(Math.max(0, Math.min(1, bias)) * 3);
    let best = rngWords.pick(candidates);
    for (let i = 1; i < draws; i++) {
      const candidate = rngWords.pick(candidates);
      if (candidate.length > best.length) best = candidate;
    }
    return best;
  };

  return {
    rngSpawn: makeRng(config.seed, "spawn"),
    rngWords,
    rngDraft: makeRng(config.seed, "draft"),
    rngEffect: makeRng(config.seed, "effect"),
    drawWord: (band, index, bias) => {
      // The first two platforms are single letters, then a two-letter word.
      // The gentlest possible first contact, and the corpus has only two
      // single-letter entries so they have to come from the alphabet.
      if (index === 0) return rngWords.pick(letters);
      if (index === 1) return rngWords.pick(letters);
      if (index === 2) return pick(2, 3, 0);

      const { min, max } = lengthForBand(band);
      return pick(min, max, bias);
    },
  };
}

/**
 * Difficulty curve.
 *
 * Applied on top of relic-resolved stats, so a band escalates without
 * overwriting a player's build. Only the flood escalates with the band here;
 * word length is handled by `lengthForBand`, and the flood's per-platform
 * acceleration does the rest.
 */
export function applyBandCurve(state: GameState): void {
  if (!state.ascent) return;
  const band = state.ascent.band - 1;
  // A gentle extra nudge per band on top of the per-platform acceleration, so
  // a new band is felt rather than merely announced.
  state.stats.floodRise *= 1 + band * 0.04;
}

/** Rebuilds stats from the base table, the held relics, and the band curve. */
export function refreshStats(state: GameState, runtime: RelicRuntime): void {
  state.stats = runtime.rebuild(state.relics, BASE_STATS);
  applyBandCurve(state);
  if (state.ascent) {
    state.ascent.shields = Math.min(state.ascent.shields, state.stats.maxShields);
  }
}

export { bandForHeight };
