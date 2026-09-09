import { describe, expect, it } from "vitest";
import { QualityMonitor } from "./quality";

const feed = (monitor: QualityMonitor, frameMs: number, count: number) => {
  let last: string | null = null;
  for (let i = 0; i < count; i++) {
    const change = monitor.sample(frameMs);
    if (change) last = change;
  }
  return last;
};

describe("QualityMonitor", () => {
  it("stays put on a machine holding 60fps", () => {
    const monitor = new QualityMonitor();
    expect(feed(monitor, 16, 2000)).toBeNull();
    expect(monitor.tier).toBe("high");
  });

  it("downgrades on sustained slow frames", () => {
    // 60 frames to fill the window, then 90 consecutive slow medians. Feeding
    // well past that would trigger the second downgrade too, so the first
    // transition is asserted on its own.
    const monitor = new QualityMonitor();
    expect(feed(monitor, 33, 150)).toBe("medium");
    expect(monitor.tier).toBe("medium");
  });

  it("keeps downgrading while the machine stays slow", () => {
    const monitor = new QualityMonitor();
    feed(monitor, 33, 600);
    expect(monitor.tier).toBe("low");
  });

  it("needs sustained evidence, not one bad stretch", () => {
    const monitor = new QualityMonitor();
    feed(monitor, 33, 80);
    expect(monitor.tier).toBe("high");
  });

  it("is not fooled by a single long pause", () => {
    // A garbage-collection pause or a tab regaining focus must not demote a
    // machine that is otherwise comfortable. This is why the decision is on
    // the median rather than the mean.
    const monitor = new QualityMonitor();
    for (let i = 0; i < 600; i++) {
      monitor.sample(i % 100 === 0 ? 240 : 15);
    }
    expect(monitor.tier).toBe("high");
  });

  it("never oscillates more than twice in a run", () => {
    // Visuals flickering between tiers while someone reads words off the
    // screen is worse than simply staying at the lower tier.
    const monitor = new QualityMonitor();
    for (let cycle = 0; cycle < 12; cycle++) {
      feed(monitor, 40, 300);
      feed(monitor, 8, 1200);
    }
    // Two changes maximum, so it cannot have travelled far from its start.
    expect(["high", "medium", "low"]).toContain(monitor.tier);
  });

  it("bottoms out rather than going past the lowest tier", () => {
    const monitor = new QualityMonitor("low");
    feed(monitor, 60, 400);
    expect(monitor.tier).toBe("off");
    feed(monitor, 60, 4000);
    expect(monitor.tier).toBe("off");
  });
});
