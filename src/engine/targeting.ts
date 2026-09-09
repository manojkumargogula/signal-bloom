import type { GameState, Transmission } from "./types";

/**
 * Target locking.
 *
 * The rule the player experiences: your first keystroke commits you to a
 * transmission, and you stay on it until it is decoded or it hits you. That
 * commitment is what makes the mode a game rather than a scramble — without
 * it, a mistyped character would silently switch targets and the player would
 * never understand what went wrong.
 *
 * Among transmissions starting with the typed character we pick the most
 * urgent, which is the closest one. Ties break by id so the choice is
 * deterministic and a seeded run replays exactly.
 */
export function resolveLock(state: GameState, char: string): Transmission | null {
  let best: Transmission | null = null;

  for (const entity of state.entities) {
    if (entity.status !== "alive") continue;
    if (entity.typed > 0) continue;
    if (entity.word[0] !== char) continue;

    if (
      best === null ||
      entity.z < best.z ||
      (entity.z === best.z && entity.id < best.id)
    ) {
      best = entity;
    }
  }
  return best;
}

export interface KeyOutcome {
  kind: "lock" | "advance" | "decode" | "mistype" | "ignored";
  entity: Transmission | null;
  expected: string | null;
}

/**
 * Applies one produced character to the field.
 *
 * Called synchronously from the input handler rather than queued to the next
 * simulation tick. A keystroke is a discrete transaction with no dependence on
 * elapsed time, so handling it off the fixed grid costs nothing in
 * determinism as long as the timestamp is recorded — and it gives back up to a
 * frame of input latency, which in a typing game is the whole product.
 */
export function applyChar(state: GameState, char: string): KeyOutcome {
  const active = state.activeId === null
    ? null
    : state.entities.find((e) => e.id === state.activeId && e.status === "alive") ?? null;

  if (active) {
    const expected = active.word[active.typed] ?? null;
    if (expected === null) return { kind: "ignored", entity: active, expected: null };

    if (char === expected) {
      active.typed++;
      if (active.typed >= active.word.length) {
        return { kind: "decode", entity: active, expected };
      }
      return { kind: "advance", entity: active, expected };
    }
    return { kind: "mistype", entity: active, expected };
  }

  const locked = resolveLock(state, char);
  if (locked) {
    locked.typed = 1;
    state.activeId = locked.id;
    if (locked.word.length === 1) {
      return { kind: "decode", entity: locked, expected: char };
    }
    return { kind: "lock", entity: locked, expected: char };
  }

  // Nothing on the field starts with this character. It is still a miss —
  // the player pressed a key that could not have been right — so it is
  // recorded, but there is no target to attribute it to.
  return { kind: "mistype", entity: null, expected: null };
}
