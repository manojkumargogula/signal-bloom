/**
 * Seeded, deterministic randomness.
 *
 * Two properties matter here and both are load-bearing:
 *
 * 1. Reproducibility. A run is defined by {seed, mode, config}, so a shared
 *    run code has to replay identically or the share feature is a lie.
 *
 * 2. Stream independence. Each concern draws from its own generator, derived
 *    as hash(seed + ":" + stream). That means adding a new random consumer
 *    later — a particle variation, a new cosmetic flourish — cannot shift the
 *    word or relic sequence of a run someone already shared. Without this,
 *    every shared code silently breaks on the next feature.
 */

export type RngStream =
  | "spawn"
  | "words"
  | "draft"
  | "powerup"
  | "effect"
  | "cosmetic";

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, in place, returning the same array. */
  shuffle<T>(items: T[]): T[];
  /** Weighted pick. Weights need not sum to 1; non-positive weights are skipped. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
}

/** String hash producing well-mixed 32-bit seeds for sfc32. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: small, fast, passes PractRand, no BigInt. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string, stream: RngStream): Rng {
  const h = xmur3(`${seed}:${stream}`);
  const next = sfc32(h(), h(), h(), h());

  // sfc32 needs a short warm-up before its output is well distributed.
  for (let i = 0; i < 12; i++) next();

  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    weighted: (items, weight) => {
      let total = 0;
      for (const item of items) {
        const w = weight(item);
        if (w > 0) total += w;
      }
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let roll = next() * total;
      for (const item of items) {
        const w = weight(item);
        if (w <= 0) continue;
        roll -= w;
        if (roll <= 0) return item;
      }
      return items[items.length - 1];
    },
  };
  return rng;
}

/** Six base36 characters: short enough to paste, wide enough to not collide. */
export function makeSeed(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += Math.floor(rand() * 36).toString(36);
  return out;
}

/**
 * A shuffled bag, refilled on exhaustion.
 *
 * Independent draws produce immediate repeats ("the the the"), which players
 * read as a bug rather than as randomness. A bag guarantees every item appears
 * once per cycle and is what every word-selection implementation should use.
 */
export class Bag<T> {
  private queue: T[] = [];

  constructor(
    private readonly items: readonly T[],
    private readonly rng: Rng,
  ) {
    if (items.length === 0) throw new Error("Bag needs at least one item");
  }

  draw(): T {
    if (this.queue.length === 0) {
      this.queue = this.rng.shuffle([...this.items]);
    }
    return this.queue.pop() as T;
  }

  drawMany(n: number): T[] {
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(this.draw());
    return out;
  }
}
