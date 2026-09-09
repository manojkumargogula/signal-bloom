import { stepAscent } from "./modes/ascent";
import { makeEffectApi, RelicRuntime } from "./relics/runtime";
import type { EngineContext, EngineEvent, GameState } from "./types";

/**
 * One simulation step, of fixed duration.
 *
 * Fixed timestep rather than variable delta, for three reasons: a seeded run
 * has to replay identically, the step is snapshot-testable, and a 144Hz
 * monitor must not make the flood rise faster than it does at 60Hz.
 * Rendering interpolates between steps.
 *
 * The radar mode's motion, impact and shield-death block used to be the
 * unconditional body of this function, which worked for the timed modes only
 * because they never put anything in the world. Now the world is explicitly
 * `state.ascent`, and a null world means there is nothing to advance.
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

  state.simTime += dt;

  const ascent = state.ascent;
  if (ascent) {
    const wasDrowned = ascent.drowned;
    stepAscent(ascent, dt);

    if (ascent.drowned && !wasDrowned) {
      state.phase = "over";
      emit({ type: "drowned", height: ascent.height, score: ascent.score });
      emit({ type: "gameOver", score: ascent.score, height: ascent.height });
      return;
    }
  }

  emit({ type: "tick", dt });
  void ctx;
  void runtime;
  void makeEffectApi;
}
