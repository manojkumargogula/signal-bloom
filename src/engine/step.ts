import { makeEffectApi, RelicRuntime } from "./relics/runtime";
import { liveEntities, refreshStats, spawnTransmission, waveBudget } from "./state";
import type { EngineContext, EngineEvent, GameState, Transmission } from "./types";

/**
 * One simulation step, of fixed duration.
 *
 * Fixed timestep rather than variable delta, for three reasons: a seeded run
 * has to replay identically, `step(state, DT)` is snapshot-testable, and a
 * 144Hz monitor must not make transmissions arrive faster than they do at
 * 60Hz. Rendering interpolates between steps using each entity's `prev`
 * position, which is what keeps motion smooth on high-refresh displays.
 */
export const DT = 1000 / 60;

/** Frames of catch-up allowed before the loop gives up and drops the debt. */
export const MAX_STEPS = 5;

/** A frame gap this long means the tab was hidden or the process stalled. */
export const STALL_MS = 250;

/** Longest frame the simulation will honour; beyond this it slows down. */
export const MAX_FRAME_MS = 50;

export function step(
  state: GameState,
  ctx: EngineContext,
  runtime: RelicRuntime,
  emit: (event: EngineEvent) => void,
  dt: number = DT,
): void {
  if (state.phase !== "running") return;

  const api = makeEffectApi(state, ctx.rngEffect, emit);
  const seconds = dt / 1000;

  state.simTime += dt;

  // ---- combo decay ------------------------------------------------------
  // Onslaught only. In Sprint and Zen there is nothing chasing the player, so
  // a decaying combo would just punish thinking.
  if (state.mode === "onslaught" && state.combo > 0 && state.stats.comboDecayMs > 0) {
    state.comboIdleMs += dt;
    if (state.comboIdleMs >= state.stats.comboDecayMs) {
      const at = state.combo;
      state.combo = 0;
      state.comboIdleMs = 0;
      emit({ type: "comboBreak", at });
    }
  }

  // ---- entity motion ----------------------------------------------------
  // Impacts are collected rather than acted on inside the loop. Ending the
  // run mid-iteration would leave impacted entities in the array and skip
  // moving the ones after them, so the cleanup below must always run.
  const impacts: Transmission[] = [];

  for (const entity of state.entities) {
    if (entity.status !== "alive") continue;

    entity.prevX = entity.x;
    entity.prevY = entity.y;
    entity.prevZ = entity.z;

    entity.z -= entity.speed * seconds;

    // Bearing wraps rather than clamping: the scope is a full circle, so a
    // contact drifting past the far bearing simply comes round the other side.
    entity.x += entity.drift * seconds;
    if (entity.x > 1) entity.x -= 2;
    else if (entity.x < -1) entity.x += 2;

    if (entity.z <= 0) {
      entity.status = "impacted";
      state.impacted++;
      if (state.activeId === entity.id) state.activeId = null;
      impacts.push(entity);
    }
  }

  // Drop finished entities. Splicing in place keeps the array dense so the
  // renderer can map entity index to a pooled DOM node.
  for (let i = state.entities.length - 1; i >= 0; i--) {
    if (state.entities[i].status !== "alive") state.entities.splice(i, 1);
  }

  for (const entity of impacts) {
    // An impact always breaks the combo. Emitting the break first means a
    // relic that softens breaks has already run by the time an impact hook
    // reads the combo.
    if (state.combo > 0) {
      const at = state.combo;
      state.combo = 0;
      emit({ type: "comboBreak", at });
    }

    state.shields -= 1;
    emit({ type: "impact", entity, shieldsLeft: state.shields });
  }

  if (state.shields <= 0) {
    state.phase = "over";
    emit({ type: "gameOver", score: state.score, wave: state.wave });
    return;
  }

  // ---- spawning ---------------------------------------------------------
  if (state.mode === "onslaught") {
    state.spawnTimer += dt;
    const live = liveEntities(state).length;

    if (
      state.spawnBudget > 0 &&
      live < state.stats.maxLive &&
      state.spawnTimer >= state.stats.spawnIntervalMs
    ) {
      state.spawnTimer = 0;
      // One carrier per wave, released once the wave is half spent, so it
      // lands as a spike rather than as an opening ambush.
      const budgetUsed = waveBudget(state.wave) - state.spawnBudget;
      const wantCarrier =
        state.wave >= 2 &&
        budgetUsed >= Math.floor(waveBudget(state.wave) / 2) &&
        !state.entities.some((e) => e.kind === "carrier");

      const entity = spawnTransmission(state, ctx, wantCarrier ? "carrier" : "normal");
      state.spawnBudget--;
      emit({ type: "spawn", entity });
    }

    // ---- wave clock ------------------------------------------------------
    state.waveClock -= dt;

    const cleared = state.spawnBudget <= 0 && liveEntities(state).length === 0;
    const expired = state.waveClock <= 0;

    if (cleared || expired) {
      emit({ type: "waveEnd", wave: state.wave, cleared });

      if (expired && !cleared) {
        // Running out of time costs a shield rather than ending the run: the
        // wave clock is pressure, not a second fail state.
        state.shields -= 1;
        if (state.shields <= 0) {
          state.phase = "over";
          emit({ type: "gameOver", score: state.score, wave: state.wave });
          return;
        }
      }

      state.wave++;
      state.waveClock = state.stats.waveDurationMs;
      state.spawnBudget = waveBudget(state.wave);
      state.spawnTimer = 0;
      state.entities.length = 0;
      state.activeId = null;

      refreshStats(state, runtime);
      state.phase = "draft";
      return;
    }
  }

  emit({ type: "tick", dt });
  void api;
}

/**
 * Scores a decoded transmission.
 *
 * Kept beside the step function because score and combo move together, and
 * splitting them across files is how they drift apart.
 */
export function scoreDecode(
  state: GameState,
  wordLength: number,
  perfect: boolean,
): number {
  const comboMultiplier = 1 + state.combo * 0.1;
  const base = wordLength * 10;
  const perfectBonus = perfect ? 1.25 : 1;
  return Math.round(base * comboMultiplier * perfectBonus * state.stats.scoreMultiplier);
}
