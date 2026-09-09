export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Maps v from [inLo,inHi] to [outLo,outHi], clamped at both ends. */
export const remap = (
  v: number,
  inLo: number,
  inHi: number,
  outLo: number,
  outHi: number,
): number => {
  if (inHi === inLo) return outLo;
  return lerp(outLo, outHi, clamp01((v - inLo) / (inHi - inLo)));
};

/** Population standard deviation. Sample sigma would understate a full run. */
export function stdev(xs: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Exact order statistic. Run samples are small enough not to need t-digest. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Wilson score lower bound for a binomial proportion at 95% confidence.
 *
 * This is what stops a key you pressed three times from topping the
 * problem-key ranking: with few attempts the bound stays near zero no matter
 * how bad the observed rate is.
 */
export function wilsonLower(successes: number, trials: number, z = 1.96): number {
  if (trials === 0) return 0;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.max(0, (centre - margin) / denom);
}
