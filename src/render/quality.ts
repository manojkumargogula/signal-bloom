import type { QualityTier } from "./webgl/shaders";

/**
 * Adaptive quality.
 *
 * Judged on the rolling MEDIAN frame time rather than the mean, because one
 * garbage-collection pause should not demote a machine that is otherwise
 * comfortable. Downgrades need sustained evidence, upgrades need more, and the
 * whole thing is capped at two changes per run so the visuals never oscillate
 * while someone is trying to read words off the screen.
 *
 * Gameplay is never degraded — only the ambient layer and the particle budget.
 */

const WINDOW = 60;
const DOWNGRADE_MS = 20;
const UPGRADE_MS = 14;
const DOWNGRADE_FRAMES = 90;
const UPGRADE_FRAMES = 600;
const MAX_CHANGES = 2;

const ORDER: QualityTier[] = ["high", "medium", "low", "off"];

export class QualityMonitor {
  private samples: number[] = [];
  private slowFrames = 0;
  private fastFrames = 0;
  private changes = 0;
  private index: number;

  constructor(initial: QualityTier = "high") {
    this.index = Math.max(0, ORDER.indexOf(initial));
  }

  get tier(): QualityTier {
    return ORDER[this.index];
  }

  get medianFrameMs(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** Returns the new tier when it changed, otherwise null. */
  sample(frameMs: number): QualityTier | null {
    // Ignore obvious outliers: a tab regaining focus is not a slow machine.
    if (frameMs > 250) return null;

    this.samples.push(frameMs);
    if (this.samples.length > WINDOW) this.samples.shift();
    if (this.samples.length < WINDOW) return null;

    const median = this.medianFrameMs;

    if (median > DOWNGRADE_MS) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else if (median < UPGRADE_MS) {
      this.fastFrames++;
      this.slowFrames = 0;
    } else {
      this.slowFrames = 0;
      this.fastFrames = 0;
    }

    if (this.changes >= MAX_CHANGES) return null;

    if (this.slowFrames >= DOWNGRADE_FRAMES && this.index < ORDER.length - 1) {
      this.index++;
      this.changes++;
      this.slowFrames = 0;
      this.samples.length = 0;
      return this.tier;
    }

    if (this.fastFrames >= UPGRADE_FRAMES && this.index > 0) {
      this.index--;
      this.changes++;
      this.fastFrames = 0;
      this.samples.length = 0;
      return this.tier;
    }

    return null;
  }
}

export const PARTICLE_BUDGET: Record<QualityTier, number> = {
  high: 600,
  medium: 300,
  low: 120,
  off: 0,
};
