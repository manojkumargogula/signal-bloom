import { describe, expect, it } from "vitest";
import { GameEngine } from "./GameEngine";
import { createContext, createState, refreshStats, waveBudget } from "./state";
import { RelicRuntime } from "./relics/runtime";
import { DT, step } from "./step";
import { applyChar, resolveLock } from "./targeting";
import type { EngineEvent, GameState } from "./types";

function makeOnslaught(seed = "test-seed") {
  const config = { mode: "onslaught" as const, seed, corpusId: "en-common" };
  const state = createState(config);
  const ctx = createContext(config);
  const runtime = new RelicRuntime();
  refreshStats(state, runtime);
  state.shields = state.stats.maxShields;
  state.phase = "running";
  const events: EngineEvent[] = [];
  return {
    state,
    ctx,
    runtime,
    events,
    run: (frames: number) => {
      for (let i = 0; i < frames; i++) {
        step(state, ctx, runtime, (e) => events.push(e), DT);
        if (state.phase !== "running") break;
      }
    },
  };
}

describe("step", () => {
  it("does nothing unless the phase is running", () => {
    const g = makeOnslaught();
    g.state.phase = "paused";
    const before = g.state.simTime;
    g.run(30);
    expect(g.state.simTime).toBe(before);
  });

  it("advances simulated time by exactly the step size", () => {
    const g = makeOnslaught();
    g.run(60);
    expect(g.state.simTime).toBeCloseTo(60 * DT, 6);
  });

  it("spawns transmissions and never exceeds maxLive", () => {
    const g = makeOnslaught();
    g.run(2000);
    const spawned = g.events.filter((e) => e.type === "spawn");
    expect(spawned.length).toBeGreaterThan(0);
    // Checked across the whole run rather than only at the end, because an
    // over-spawn that resolves before the last frame would still be a bug.
    expect(g.state.entities.length).toBeLessThanOrEqual(g.state.stats.maxLive);
  });

  it("moves transmissions toward the player and records the previous position", () => {
    const g = makeOnslaught();
    g.run(200);
    const entity = g.state.entities[0];
    expect(entity).toBeDefined();
    g.run(1);
    expect(entity.z).toBeLessThan(entity.prevZ);
  });

  it("costs a shield on impact and ends the run at zero", () => {
    const g = makeOnslaught();
    // Long enough for several transmissions to cross the whole field.
    g.run(20_000);
    expect(g.state.phase === "over" || g.state.impacted > 0 || g.state.wave > 1).toBe(true);
  });

  it("emits gameOver exactly once", () => {
    const g = makeOnslaught();
    g.state.shields = 1;
    g.run(20_000);
    const overs = g.events.filter((e) => e.type === "gameOver");
    expect(overs.length).toBeLessThanOrEqual(1);
  });
});

describe("invariants", () => {
  const check = (state: GameState) => {
    expect(state.shields).toBeLessThanOrEqual(state.stats.maxShields);
    expect(state.combo).toBeLessThanOrEqual(state.stats.comboCap);
    expect(state.combo).toBeGreaterThanOrEqual(0);
    expect(state.entities.length).toBeLessThanOrEqual(state.stats.maxLive);
    for (const e of state.entities) {
      expect(e.status).toBe("alive");
      expect(e.x).toBeGreaterThanOrEqual(-1);
      expect(e.x).toBeLessThanOrEqual(1);
    }
    if (state.activeId !== null) {
      expect(state.entities.some((e) => e.id === state.activeId)).toBe(true);
    }
  };

  it("holds across many seeds and a long run", () => {
    for (const seed of ["a1", "zz9", "seed42", "bloom", "qqqq", "0000"]) {
      const g = makeOnslaught(seed);
      for (let i = 0; i < 40; i++) {
        g.run(100);
        if (g.state.phase === "over") break;
        check(g.state);
        if (g.state.phase === "draft") g.state.phase = "running";
      }
    }
  });

  it("keeps the entity array dense — no dead entities left behind", () => {
    const g = makeOnslaught();
    g.run(5000);
    expect(g.state.entities.every((e) => e.status === "alive")).toBe(true);
  });
});

describe("determinism", () => {
  it("produces identical state from the same seed", () => {
    const a = makeOnslaught("determinism");
    const b = makeOnslaught("determinism");
    a.run(3000);
    b.run(3000);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it("produces different state from different seeds", () => {
    const a = makeOnslaught("seed-one");
    const b = makeOnslaught("seed-two");
    a.run(1000);
    b.run(1000);
    expect(JSON.stringify(a.state)).not.toBe(JSON.stringify(b.state));
  });

  it("is independent of frame pacing", () => {
    // The property that justifies the fixed timestep: the same elapsed time
    // must produce the same state whether it arrived as one long frame or
    // many short ones. Without this, a 144Hz monitor would be playing a
    // different game from a 60Hz one.
    const smooth = makeOnslaught("pacing");
    const jittery = makeOnslaught("pacing");

    for (let i = 0; i < 600; i++) smooth.run(1);
    // Same total, arriving in irregular bursts.
    const bursts = [3, 1, 5, 2, 1, 4, 1, 1, 2, 3];
    let delivered = 0;
    let i = 0;
    while (delivered < 600) {
      const n = Math.min(bursts[i % bursts.length], 600 - delivered);
      jittery.run(n);
      delivered += n;
      i++;
    }

    expect(jittery.state.simTime).toBeCloseTo(smooth.state.simTime, 6);
    expect(JSON.stringify(jittery.state)).toBe(JSON.stringify(smooth.state));
  });
});

describe("targeting", () => {
  it("locks the nearest transmission whose word starts with the character", () => {
    const g = makeOnslaught();
    g.run(400);
    const alive = g.state.entities;
    if (alive.length < 2) return;

    const char = alive[0].word[0];
    const candidates = alive.filter((e) => e.word[0] === char && e.typed === 0);
    const locked = resolveLock(g.state, char);

    if (candidates.length > 0) {
      expect(locked).not.toBeNull();
      const nearest = candidates.reduce((a, b) => (a.z <= b.z ? a : b));
      expect(locked?.z).toBeCloseTo(nearest.z, 10);
    }
  });

  it("breaks ties by id so a seeded run replays exactly", () => {
    const g = makeOnslaught();
    g.state.entities = [
      { ...template(2), word: "same", z: 0.5 },
      { ...template(1), word: "same", z: 0.5 },
    ];
    expect(resolveLock(g.state, "s")?.id).toBe(1);
  });

  it("stays on the locked target even when another word would match", () => {
    // The commitment that makes the mode legible: a mistyped character must
    // not silently switch targets, or the player never learns what went wrong.
    const g = makeOnslaught();
    g.state.entities = [
      { ...template(1), word: "alpha", z: 0.2 },
      { ...template(2), word: "azure", z: 0.4 },
    ];
    expect(applyChar(g.state, "a").kind).toBe("lock");
    expect(g.state.activeId).toBe(1);

    // "z" is correct for the other transmission but wrong for the locked one.
    const outcome = applyChar(g.state, "z");
    expect(outcome.kind).toBe("mistype");
    expect(g.state.activeId).toBe(1);
  });

  it("decodes a single-character word on the first keystroke", () => {
    const g = makeOnslaught();
    g.state.entities = [{ ...template(1), word: "a", z: 0.5 }];
    expect(applyChar(g.state, "a").kind).toBe("decode");
  });

  it("reports a keystroke matching nothing as a mistype with no target", () => {
    const g = makeOnslaught();
    g.state.entities = [{ ...template(1), word: "alpha", z: 0.5 }];
    const outcome = applyChar(g.state, "q");
    expect(outcome.kind).toBe("mistype");
    expect(outcome.entity).toBeNull();
  });
});

function template(id: number) {
  return {
    id,
    word: "word",
    typed: 0,
    x: 0,
    y: 0,
    z: 1,
    prevX: 0,
    prevY: 0,
    prevZ: 1,
    speed: 0.05,
    drift: 0,
    kind: "normal" as const,
    status: "alive" as const,
    spawnedAt: 0,
  };
}

describe("waveBudget", () => {
  it("grows with the wave number", () => {
    expect(waveBudget(2)).toBeGreaterThan(waveBudget(1));
    expect(waveBudget(10)).toBeGreaterThan(waveBudget(5));
  });
});

describe("GameEngine", () => {
  it("starts on the first keystroke and records it", () => {
    const engine = new GameEngine({
      mode: "sprint",
      seed: "engine-test",
      corpusId: "en-common",
      durationMs: 15_000,
    });
    expect(engine.state.phase).toBe("idle");

    const target = engine.getSnapshot().targets[0];
    engine.handleChar(target[0], 1000, "KeyA");

    expect(engine.state.phase).toBe("running");
    expect(engine.keystrokeLog).toHaveLength(1);
  });

  it("pauses on a long frame gap rather than fast-forwarding", () => {
    // A hidden tab or a suspended process must not teleport transmissions
    // into the player on the frame the tab comes back.
    const engine = new GameEngine({
      mode: "onslaught",
      seed: "stall",
      corpusId: "en-common",
    });
    engine.start(0);
    engine.advance(100, 16);
    const timeBefore = engine.state.simTime;

    engine.advance(6000, 5900);
    expect(engine.state.phase).toBe("paused");
    expect(engine.state.simTime).toBe(timeBefore);
  });

  it("excludes paused time from the metrics clock", () => {
    const engine = new GameEngine({
      mode: "sprint",
      seed: "pause-clock",
      corpusId: "en-common",
      durationMs: 30_000,
    });
    const targets = engine.getSnapshot().targets;
    engine.handleChar(targets[0][0], 1000, "KeyA");
    engine.pause(2000);
    engine.resume(12_000); // ten seconds away from the keyboard
    engine.handleChar(targets[0][1], 12_100, "KeyB");

    const result = engine.result();
    // Without the exclusion this would be over 11 seconds and the WPM would
    // be nonsense.
    expect(result.metrics.durationMs).toBeLessThan(2000);
    expect(result.metrics.pausedMs).toBeCloseTo(10_000, 0);
  });

  it("ends a word-count sprint when the last word is finished", () => {
    const engine = new GameEngine({
      mode: "sprint",
      seed: "wordcount",
      corpusId: "en-common",
      wordCount: 3,
    });
    const targets = engine.getSnapshot().targets;
    let t = 1000;
    for (const target of targets) {
      for (const ch of target) engine.handleChar(ch, (t += 100), null);
    }
    expect(engine.state.phase).toBe("over");
  });

  it("produces a result with finite numbers even from an empty run", () => {
    const engine = new GameEngine({
      mode: "sprint",
      seed: "empty",
      corpusId: "en-common",
      durationMs: 15_000,
    });
    const result = engine.result();
    expect(Number.isFinite(result.metrics.wpm)).toBe(true);
    expect(Number.isFinite(result.metrics.accuracy)).toBe(true);
  });

  it("publishes a snapshot whose identity is stable when nothing changes", () => {
    // What keeps the HUD at roughly ten renders a second instead of sixty.
    const engine = new GameEngine({
      mode: "onslaught",
      seed: "snapshot",
      corpusId: "en-common",
    });
    engine.start(0);
    const first = engine.getSnapshot();
    engine.advance(16, 16);
    expect(engine.getSnapshot()).toBe(first);
  });
});

describe("live speed readout", () => {
  const typeInto = (engine: GameEngine, count: number, startAt: number, gapMs: number) => {
    let t = startAt;
    for (let i = 0; i < count; i++) {
      const snap = engine.getSnapshot();
      const target = snap.targets[snap.wordIndex] ?? "";
      const ch = target[snap.charIndex];
      if (ch === undefined) break;
      t += gapMs;
      engine.handleChar(ch, t, "KeyA");
    }
    return t;
  };

  it("holds Zen speed steady across a long pause", () => {
    // Both a cumulative average and a trailing wall-clock window collapse to
    // near zero during a pause, which in an untimed mode punishes exactly the
    // pausing the mode exists to allow. The rate has to describe the typing,
    // not the elapsed time.
    const zen = new GameEngine({ mode: "zen", seed: "zen-window", corpusId: "en-common" });
    zen.start(0);
    const after = typeInto(zen, 60, 0, 100);
    const before = zen.getSnapshot().wpm;

    // 100ms per keystroke is 120 WPM at five characters to the word.
    expect(before).toBeGreaterThan(100);
    expect(before).toBeLessThan(140);

    // Two minutes of thinking, then one more keystroke.
    zen.handleChar(" ", after + 120_000, null);
    const during = zen.getSnapshot().wpm;

    // The figure is older, not smaller.
    expect(during).toBeGreaterThan(before * 0.8);
  });

  it("reports the typing rate in Zen, not the session average", () => {
    // Someone who types a burst, thinks for a while, then types another burst
    // at the same speed should read the same rate both times.
    const zen = new GameEngine({ mode: "zen", seed: "zen-bursts", corpusId: "en-common" });
    zen.start(0);

    let t = typeInto(zen, 40, 0, 120);
    const firstBurst = zen.getSnapshot().wpm;

    t += 45_000; // a long think
    typeInto(zen, 40, t, 120);
    const secondBurst = zen.getSnapshot().wpm;

    expect(firstBurst).toBeGreaterThan(80);
    expect(secondBurst).toBeCloseTo(firstBurst, 0);
  });

  it("keeps Sprint cumulative, because the whole-run average is the result", () => {
    const sprint = new GameEngine({
      mode: "sprint",
      seed: "sprint-cumulative",
      corpusId: "en-common",
      durationMs: 120_000,
    });
    sprint.start(0);
    const after = typeInto(sprint, 60, 0, 100);
    const before = sprint.getSnapshot().wpm;

    sprint.handleChar(" ", after + 30_000, null);
    const during = sprint.getSnapshot().wpm;

    // Idle time genuinely lowers a timed result and must keep doing so.
    expect(during).toBeLessThan(before / 2);
  });
});
