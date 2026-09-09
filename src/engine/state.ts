import { getCorpus } from "@/data";
import { Bag, makeRng, type Rng } from "./rng";
import { RelicRuntime } from "./relics/runtime";
import { BASE_STATS, type EngineContext, type GameState, type ModeId } from "./types";

export interface RunConfig {
  mode: ModeId;
  seed: string;
  corpusId: string;
  /** Sprint only: run length. Ignored by Onslaught and Zen. */
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
    wave: 1,
    waveClock: BASE_STATS.waveDurationMs,
    entities: [],
    activeId: null,
    combo: 0,
    comboBest: 0,
    comboIdleMs: 0,
    shields: BASE_STATS.maxShields,
    score: 0,
    decoded: 0,
    impacted: 0,
    perfect: 0,
    stats: { ...BASE_STATS },
    relics: [],
    draft: null,
    nextEntityId: 1,
    spawnTimer: 0,
    spawnBudget: waveBudget(1),
  };
}

/** How many transmissions a wave sends before it can be cleared. */
export function waveBudget(wave: number): number {
  return 8 + Math.floor(wave * 2.5);
}

export function createContext(config: RunConfig): EngineContext {
  const corpus = getCorpus(config.corpusId);
  const rngWords = makeRng(config.seed, "words");

  const pool = corpus.words.length > 0 ? corpus.words : ["signal"];
  const bag = new Bag(pool, rngWords);

  return {
    rngSpawn: makeRng(config.seed, "spawn"),
    rngWords,
    rngDraft: makeRng(config.seed, "draft"),
    rngEffect: makeRng(config.seed, "effect"),
    drawWord: (bias: number) => {
      // Length bias draws a few candidates and keeps the longest. Drawing
      // from the bag rather than sampling independently is what stops the
      // same word appearing twice in a row, which players read as a bug.
      const draws = 1 + Math.round(Math.max(0, Math.min(1, bias)) * 3);
      let best = bag.draw();
      for (let i = 1; i < draws; i++) {
        const candidate = bag.draw();
        if (candidate.length > best.length) best = candidate;
      }
      return best;
    },
  };
}

/**
 * Difficulty curve.
 *
 * Applied on top of relic-resolved stats, so a wave escalates without
 * overwriting a player's build. Escalation is capped: past roughly wave 20 the
 * pressure comes from word length and volume rather than from speed, because
 * a transmission moving faster than the player can read is not difficulty, it
 * is a coin flip.
 */
export function applyWaveCurve(state: GameState): void {
  const w = state.wave - 1;
  const speedRamp = Math.min(1.9, 1 + w * 0.085);
  const spawnRamp = Math.max(0.42, 1 - w * 0.055);

  state.stats.approachSpeed *= speedRamp;
  state.stats.spawnIntervalMs *= spawnRamp;
  state.stats.maxLive = Math.min(state.stats.maxLive + Math.floor(w / 3), 14);
  state.stats.lengthBias = Math.min(1, state.stats.lengthBias + w * 0.05);
}

/** Rebuilds stats from the base table, the held relics, and the wave curve. */
export function refreshStats(state: GameState, runtime: RelicRuntime): void {
  state.stats = runtime.rebuild(state.relics, BASE_STATS);
  applyWaveCurve(state);
  state.shields = Math.min(state.shields, state.stats.maxShields);
}

export function activeEntity(state: GameState) {
  if (state.activeId === null) return null;
  return state.entities.find((e) => e.id === state.activeId) ?? null;
}

export function liveEntities(state: GameState) {
  return state.entities.filter((e) => e.status === "alive");
}

export function spawnTransmission(
  state: GameState,
  ctx: EngineContext,
  kind: "normal" | "carrier" = "normal",
): GameState["entities"][number] {
  const word =
    kind === "carrier"
      ? // A carrier is the wave's pressure spike, so it wants a genuinely
        // long word rather than a random one.
        [ctx.drawWord(1), ctx.drawWord(1), ctx.drawWord(1)].reduce((a, b) =>
          a.length >= b.length ? a : b,
        )
      : ctx.drawWord(state.stats.lengthBias);

  // Keep spawns away from the exact centre column, where the typing surface
  // sits, and spread them over the upper field.
  const side = ctx.rngSpawn.next() < 0.5 ? -1 : 1;
  const x = side * ctx.rngSpawn.range(0.12, 0.92);
  const y = ctx.rngSpawn.range(-0.85, 0.35);

  const entity = {
    id: state.nextEntityId++,
    word,
    typed: 0,
    x,
    y,
    z: 1,
    prevX: x,
    prevY: y,
    prevZ: 1,
    speed:
      state.stats.approachSpeed *
      ctx.rngSpawn.range(0.85, 1.15) *
      (kind === "carrier" ? 0.66 : 1),
    drift: ctx.rngSpawn.range(-0.05, 0.05),
    kind,
    status: "alive" as const,
    spawnedAt: state.simTime,
  };

  state.entities.push(entity);
  return entity;
}
