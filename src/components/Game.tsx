"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunResult } from "@/engine/GameEngine";
import type { EngineEvent, ModeId } from "@/engine/types";
import { attachInputRouter } from "@/input/router";
import { useAutoPause, useGame } from "@/react/useEngine";
import { useFullscreen } from "@/react/useFullscreen";
import { useMotionPrefs } from "@/react/useMotionPrefs";
import { readColour, readPalette } from "@/render/palette";
import { ParticleLayer } from "@/render/particles";
import { PARTICLE_BUDGET, QualityMonitor } from "@/render/quality";
import { Stage } from "@/render/stage";
import { NebulaLayer } from "@/render/webgl/NebulaLayer";
import { Hud } from "./hud/Hud";
import { RelicDraft } from "./RelicDraft";
import { TypingSurface } from "./TypingSurface";

export interface GameProps {
  mode: ModeId;
  seed: string;
  corpusId: string;
  durationMs?: number;
  wordCount?: number;
  onComplete?: (result: RunResult) => void;
}

/**
 * The game shell.
 *
 * This component owns the ONE requestAnimationFrame loop in the application.
 * The loop reads engine state and writes to the DOM, the canvases and the
 * shader imperatively; it never sets React state. While the player is typing,
 * React renders about ten times a second — driven by the engine's throttled
 * HUD snapshot — rather than sixty.
 */
export function Game({
  mode,
  seed,
  corpusId,
  durationMs,
  wordCount,
  onComplete,
}: GameProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const announceRef = useRef<HTMLParagraphElement>(null);

  const motion = useMotionPrefs();
  const { toggle: toggleFullscreen } = useFullscreen(shellRef, inputRef);
  const [glFailed, setGlFailed] = useState(false);

  const nebulaRef = useRef<NebulaLayer | null>(null);
  const particlesRef = useRef<ParticleLayer | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const qualityRef = useRef(new QualityMonitor());

  // Engine events are consumed by the render layers, not by React, so this
  // callback deliberately sets no state.
  const handleEvent = useCallback((event: EngineEvent) => {
    if (event.type === "decoded") {
      const field = fieldRef.current;
      const stage = stageRef.current;
      const particles = particlesRef.current;
      const nebula = nebulaRef.current;
      if (!field) return;

      const viewport = { width: field.clientWidth, height: field.clientHeight };
      const at = stage?.positionOf(event.entity.x, event.entity.y, event.entity.z, viewport);

      if (at && particles) {
        particles.burst({
          x: at.x,
          y: at.y,
          power: event.perfect ? 1 : 0.6,
          colour: readColour(event.entity.kind === "carrier" ? "--amber" : "--amber-dim"),
        });
      }
      // The signature effect: the decoded word pushes a real echo out across
      // the scope, from exactly where it was destroyed. The shader works in
      // the same -1..1 scope coordinates the stage projects onto, so the echo
      // and the word agree without either knowing about pixels.
      if (at) {
        nebula?.addBloom(
          (at.x / Math.max(viewport.width, 1)) * 2 - 1,
          (at.y / Math.max(viewport.height, 1)) * 2 - 1,
          performance.now(),
          event.perfect ? 1 : 0.7,
        );
      }
    }

    if (event.type === "waveStart" && announceRef.current) {
      announceRef.current.textContent = `Wave ${event.wave}`;
    }
  }, []);

  const { engine, snapshot } = useGame({
    mode,
    seed,
    corpusId,
    durationMs,
    wordCount,
    onEvent: handleEvent,
  });

  useAutoPause(engine);

  // ---- render layers ----------------------------------------------------
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    stageRef.current = new Stage(field);

    if (fxRef.current) {
      particlesRef.current = new ParticleLayer(fxRef.current);
      particlesRef.current.resize();
    }

    return () => {
      stageRef.current = null;
      particlesRef.current = null;
    };
  }, []);

  // WebGL is initialised after first paint, on purpose. Context creation plus
  // shader compilation is tens of milliseconds of main-thread work, and doing
  // it during mount would push it in front of the largest contentful paint.
  useEffect(() => {
    if (!motion.background) return;
    const canvas = glRef.current;
    if (!canvas) return;

    let cancelled = false;
    let layer: NebulaLayer | null = null;

    const boot = () => {
      if (cancelled) return;
      layer = new NebulaLayer(canvas);
      const ok = layer.init("high", readPalette());
      if (!ok) {
        setGlFailed(true);
        return;
      }
      layer.resize();
      nebulaRef.current = layer;
    };

    // Two frames guarantees first paint has landed before this runs.
    const outer = requestAnimationFrame(() => requestAnimationFrame(boot));

    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
      layer?.dispose();
      nebulaRef.current = null;
    };
  }, [motion.background]);

  // Repaint the shader when the theme changes: the palette lives in CSS, so
  // the uniforms have to be re-read rather than recomputed.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      nebulaRef.current?.setPalette(readPalette());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // ---- input ------------------------------------------------------------
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const detach = attachInputRouter({
      input,
      isFullscreen: () => document.fullscreenElement !== null,
      isAccepting: () =>
        engine.state.phase === "running" || engine.state.phase === "idle",
      handlers: {
        onChar: (char, t, code, synthetic) => engine.handleChar(char, t, code, synthetic),
        onBackspace: (t, wordDelete) => engine.handleBackspace(t, wordDelete),
        onPause: () => {
          const now = performance.now();
          if (engine.state.phase === "running") engine.pause(now);
          else if (engine.state.phase === "paused") engine.resume(now);
        },
        onConfirm: () => {
          if (engine.state.phase === "paused") engine.resume(performance.now());
        },
        onPaste: () => engine.markInvalid("paste"),
      },
    });

    input.focus({ preventScroll: true });
    return detach;
  }, [engine]);

  // Onslaught opens itself: an empty field waiting for a keystroke reads as
  // broken rather than as ready. Sprint and Zen wait, because their clocks
  // must not run while the player is still reading the words.
  useEffect(() => {
    if (!engine.startsImmediately) return;
    const id = requestAnimationFrame(() => engine.start(performance.now()));
    return () => cancelAnimationFrame(id);
  }, [engine]);

  // ---- the loop ---------------------------------------------------------
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let completed = false;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const frameMs = now - last;
      last = now;

      const alpha = engine.advance(now, frameMs);

      // Quality is judged on the median frame time, so one slow frame cannot
      // demote a machine that is otherwise comfortable.
      const change = qualityRef.current.sample(frameMs);
      if (change) {
        nebulaRef.current?.setTier(change);
        particlesRef.current?.setBudget(PARTICLE_BUDGET[change]);
      }

      const field = fieldRef.current;
      if (field && stageRef.current) {
        stageRef.current.render(
          engine.entities,
          { width: field.clientWidth, height: field.clientHeight },
          motion.smoothing ? alpha : 1,
          engine.state.activeId,
        );
      }

      particlesRef.current?.step(frameMs);
      nebulaRef.current?.render(now);

      // Onslaught pauses into the draft between waves; opening it here keeps
      // the transition on the loop rather than in a React effect.
      if (engine.state.phase === "draft" && engine.state.draft === null) {
        engine.openDraft();
      }

      if (engine.state.phase === "over" && !completed) {
        completed = true;
        onComplete?.(engine.result());
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, motion.smoothing, onComplete]);

  // F toggles fullscreen. Handled here rather than in the input policy
  // because it is a view command, not typing -- and it must not fire while a
  // run is accepting characters, or the player could never type an F.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "f" && event.key !== "F") return;
      const accepting =
        engine.state.phase === "running" || engine.state.phase === "idle";
      if (accepting) return;
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, toggleFullscreen]);

  // ---- resize -----------------------------------------------------------
  useEffect(() => {
    const onResize = () => {
      nebulaRef.current?.resize();
      particlesRef.current?.resize();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
  }, []);

  const phase = snapshot?.phase ?? "idle";
  const showGlFallback = glFailed || !motion.background;

  return (
    <div
      ref={shellRef}
      className="scanlines vignette relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg)]"
    >
      {/* Layer 0: the ambient field. Hidden from assistive tech -- it carries
          no information, and the state it reflects is announced elsewhere. */}
      <canvas
        ref={glRef}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full ${showGlFallback ? "hidden" : ""}`}
      />
      {showGlFallback && <div aria-hidden="true" className="phosphor-fallback absolute inset-0" />}

      {/* The readout strip */}
      <div className="relative z-20 shrink-0 px-5 pt-4 pb-2">
        {snapshot && <Hud snapshot={snapshot} />}
      </div>

      {/* Layer 1: transmissions */}
      <div ref={fieldRef} className="relative z-10 min-h-0 flex-1">
        {/* Layer 2: decode bursts */}
        <canvas
          ref={fxRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {mode !== "onslaught" && snapshot && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 sm:px-16">
            <TypingSurface
              targets={snapshot.targets}
              wordIndex={snapshot.wordIndex}
              charIndex={snapshot.charIndex}
              typedWords={snapshot.typedWords}
            />
          </div>
        )}
      </div>

      {/* The capture surface. Visually hidden but focusable and NOT
          display:none -- an unfocusable element cannot raise a mobile
          keyboard, and browsers will not deliver beforeinput to it. */}
      <input
        ref={inputRef}
        className="visually-hidden"
        aria-label="Typing input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="done"
      />

      {/* Run-level announcements only, at most one per wave. Announcing every
          word would flood the screen-reader buffer and make the game
          genuinely unplayable. */}
      <p ref={announceRef} className="visually-hidden" aria-live="polite" aria-atomic="true" />

      {phase === "idle" && (
        <Overlay title="Awaiting input" hint="Start typing to open the channel." />
      )}

      {phase === "paused" && (
        <Overlay
          title="Paused"
          hint="Press Escape or Enter to resume. The clock is stopped."
        />
      )}

      {phase === "draft" && snapshot?.draft && (
        <RelicDraft
          offers={snapshot.draft}
          wave={snapshot.wave}
          onPick={(id) => engine.pickRelic(id)}
          onSkip={() => engine.skipDraft()}
        />
      )}
    </div>
  );
}

function Overlay({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--bg)]/85">
      {/* A solid panel, not a translucent wash. An overlay laid straight over
          the typing surface leaves its own text competing with the words
          underneath and neither is readable. */}
      <div className="flex flex-col items-center gap-2 border border-[var(--line-strong)] bg-[var(--bg-panel)] px-8 py-6">
        <p className="label text-[var(--amber)]">{title}</p>
        <p className="text-sm text-[var(--fg-muted)]">{hint}</p>
      </div>
    </div>
  );
}
