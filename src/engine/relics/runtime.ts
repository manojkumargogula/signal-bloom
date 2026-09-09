import type { Rng } from "../rng";
import type { EngineEvent, EngineEventType, GameState, OwnedRelic, Stats } from "../types";
import { RELIC_BY_ID, RELICS } from "./defs";
import { resolveStats, type EffectApi, type RelicDef, type StatOp } from "./types";

interface CompiledHook {
  relicId: string;
  stacks: number;
  priority: number;
  // The definition's hook signature is narrowed per event type; the registry
  // has to store them uniformly, so this is the one place the union is widened.
  run: (api: EffectApi, event: EngineEvent, stacks: number) => void;
}

/**
 * Compiles owned relics into a stat table and hook maps, once per draft.
 *
 * The point is that dispatch during play costs a map lookup and a loop over
 * zero to three handlers. An empty hook map costs one `undefined` check, so a
 * player holding no relics pays nothing.
 */
export class RelicRuntime {
  private hooks = new Map<EngineEventType, CompiledHook[]>();

  rebuild(owned: readonly OwnedRelic[], base: Stats): Stats {
    this.hooks.clear();

    const ops: StatOp[] = [];
    // Sort by id so two players holding the same relics in a different draft
    // order get identical stats.
    const sorted = [...owned].sort((a, b) => a.id.localeCompare(b.id));

    for (const { id, stacks } of sorted) {
      const def = RELIC_BY_ID[id];
      if (!def) continue;

      if (def.modifiers) ops.push(...def.modifiers(stacks));

      if (def.hooks) {
        for (const [type, hook] of Object.entries(def.hooks)) {
          if (!hook) continue;
          const key = type as EngineEventType;
          const list = this.hooks.get(key) ?? [];
          list.push({
            relicId: id,
            stacks,
            priority: def.priority ?? 0,
            run: hook as CompiledHook["run"],
          });
          this.hooks.set(key, list);
        }
      }
    }

    for (const list of this.hooks.values()) {
      list.sort((a, b) => b.priority - a.priority || a.relicId.localeCompare(b.relicId));
    }

    return resolveStats(base, ops);
  }

  emit(event: EngineEvent, api: EffectApi): void {
    const list = this.hooks.get(event.type);
    if (!list) return;
    for (const hook of list) hook.run(api, event, hook.stacks);
  }

  hookCount(type: EngineEventType): number {
    return this.hooks.get(type)?.length ?? 0;
  }
}

const RARITY_WEIGHT: Record<string, (band: number) => number> = {
  // Epics stay out of reach early, then become plausible; commons never
  // vanish entirely, so a late draft is still a real choice rather than a
  // guaranteed jackpot.
  common: () => 60,
  rare: (band) => 20 + Math.min(25, band * 8),
  epic: (band) => Math.max(0, Math.min(22, (band - 1) * 9)),
};

export function eligibleRelics(
  owned: readonly OwnedRelic[],
  band: number,
): RelicDef[] {
  const ownedMap = new Map(owned.map((o) => [o.id, o.stacks]));
  const ownedIds = new Set(ownedMap.keys());

  return RELICS.filter((def) => {
    if ((def.minBand ?? 0) > band) return false;
    if ((ownedMap.get(def.id) ?? 0) >= def.maxStacks) return false;
    // Mutual exclusion has to be checked in both directions: the held relic
    // may be the one naming the conflict.
    if (def.exclusiveWith?.some((id) => ownedIds.has(id))) return false;
    for (const id of ownedIds) {
      if (RELIC_BY_ID[id]?.exclusiveWith?.includes(def.id)) return false;
    }
    return true;
  });
}

/** Draws `count` distinct relic offers for a between-wave draft. */
export function draftRelics(
  owned: readonly OwnedRelic[],
  band: number,
  rng: Rng,
  count = 3,
): string[] {
  const pool = eligibleRelics(owned, band);
  const picked: string[] = [];
  const remaining = [...pool];

  while (picked.length < count && remaining.length > 0) {
    const chosen = rng.weighted(remaining, (def) => RARITY_WEIGHT[def.rarity](band));
    picked.push(chosen.id);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return picked;
}

export function addRelic(owned: OwnedRelic[], id: string): OwnedRelic[] {
  const existing = owned.find((o) => o.id === id);
  if (existing) {
    const def = RELIC_BY_ID[id];
    existing.stacks = Math.min(existing.stacks + 1, def?.maxStacks ?? 1);
  } else {
    owned.push({ id, stacks: 1 });
  }
  return owned;
}

export function makeEffectApi(
  state: GameState,
  rng: Rng,
  emit: (event: EngineEvent) => void,
): EffectApi {
  return {
    state,
    get stats() {
      return state.stats;
    },
    grantShield(n) {
      const ascent = state.ascent;
      if (!ascent || n <= 0) return;
      const before = ascent.shields;
      ascent.shields = Math.min(ascent.shields + n, state.stats.maxShields);
      if (ascent.shields !== before) emit({ type: "shieldGained", total: ascent.shields });
    },
    pushFlood(spacings) {
      const ascent = state.ascent;
      if (!ascent || spacings <= 0) return;
      ascent.gap = Math.min(ascent.gap + spacings, state.stats.gapMax);
    },
    addScore(n) {
      if (state.ascent) state.ascent.score += Math.round(n);
    },
    addCombo(n) {
      const ascent = state.ascent;
      if (!ascent) return;
      ascent.combo = Math.min(ascent.combo + n, state.stats.comboCap);
      ascent.comboBest = Math.max(ascent.comboBest, ascent.combo);
    },
    setCombo(n) {
      const ascent = state.ascent;
      if (!ascent) return;
      ascent.combo = Math.max(0, Math.min(n, state.stats.comboCap));
    },
    rng: () => rng.next(),
  };
}
