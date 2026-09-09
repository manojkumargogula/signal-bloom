"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bandTheme } from "@/data/bands";
import type { RunResult } from "@/engine/GameEngine";
import { LOOKAHEAD } from "@/engine/modes/ascent";
import type { EngineEvent, ModeId } from "@/engine/types";
import { attachInputRouter } from "@/input/router";
import { useAutoPause, useGame } from "@/react/useEngine";
import { useFullscreen } from "@/react/useFullscreen";
import { useMotionPrefs } from "@/react/useMotionPrefs";
import { asset } from "@/lib/paths";
import { readColour } from "@/render/palette";
import { Climber } from "@/render/ascent/climber";
import { AscentStage, WATER_LINE_OFFSET } from "@/render/ascent/stage";
import { ParticleLayer } from "@/render/particles";
import { PARTICLE_BUDGET, QualityMonitor } from "@/render/quality";
import { Hud } from "./hud/Hud";
import { RelicDraft } from "./RelicDraft";
import { TypingSurface } from "./TypingSurface";

/**
 * Whether the generated sky art is in the build yet.
 *
 * Until it is, the gradient fallback IS the sky -- which is deliberate: the
 * mode had to be proven playable before any of the expensive art was made,
 * and the gradient is also what reduced motion and a failed image load get.
 */
const HAS_SKY_ART = false;

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
 * The loop reads engine state and writes to the DOM and the canvas
 * imperatively; it never sets React state. While the player is typing, React
 * renders about ten times a second — driven by the engine's throttled HUD
 * snapshot — rather than sixty.
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
  const skyRef = useRef<HTMLDivElement>(null);
  const ridgeFarRef = useRef<HTMLDivElement>(null);
  const ridgeNearRef = useRef<HTMLDivElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const announceRef = useRef<HTMLParagraphElement>(null);

  const motion = useMotionPrefs();
  const { toggle: toggleFullscreen } = useFullscreen(shellRef, inputRef);

  const stageRef = useRef<AscentStage | null>(null);
  const climberRef = useRef<Climber | null>(null);
  const particlesRef = useRef<ParticleLayer | null>(null);
  const qualityRef = useRef(new QualityMonitor());

  /** Interpolated camera height, in platform spacings. */
  const cameraRef = useRef(0);
  /** Decays after a wrong letter, so the flinch is a transient. */
  const flinchRef = useRef(0);
  /** The band whose colours are currently applied, so writes are rare. */
  const appliedBandRef = useRef(-1);
  /** Whether the water is already in its warning state, so writes are rare. */
  const dangerRef = useRef(false);
  const [bandForSky, setBandForSky] = useState(1);

  /**
   * Engine events are consumed by the render layers, not by React, so this
   * deliberately sets almost no state.
   */
  const handleEvent = useCallback((event: EngineEvent) => {
    if (event.type === "cleared") {
      const field = fieldRef.current;
      const particles = particlesRef.current;
      if (field && particles) {
        // Landing dust. The cheapest single contributor to the climber
        // feeling like it has weight.
        particles.burst({
          x: field.clientWidth * 0.5,
          y: AscentStage.feetY(field.clientHeight),
          power: event.perfect ? 1 : 0.55,
          colour: readColour(event.perfect ? "--amber" : "--fg-muted"),
        });
      }
    }

    if (event.type === "mistype" && event.charged) {
      // A flinch, and nothing else. No screen shake: shake plus a scrolling
      // camera plus a per-letter crouch would be three motions competing with
      // the one thing that has to stay readable.
      flinchRef.current = 1;
    }

    if (event.type === "bandStart") {
      setBandForSky(event.band);
      if (announceRef.current) {
        announceRef.current.textContent = `Band ${event.band}, ${bandTheme(event.band).name}`;
      }
    }

    if (event.type === "drowned" && announceRef.current) {
      announceRef.current.textContent = `Run over. The water caught you at ${event.height} platforms.`;
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

    stageRef.current = new AscentStage(field);
    const climber = new Climber(field);
    climber.mount();
    climberRef.current = climber;

    if (fxRef.current) {
      particlesRef.current = new ParticleLayer(fxRef.current);
      particlesRef.current.resize();
    }

    return () => {
      climber.dispose();
      stageRef.current = null;
      climberRef.current = null;
      particlesRef.current = null;
    };
  }, []);

  // ---- input ------------------------------------------------------------
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const detach = attachInputRouter({
      input,
      surface: shellRef.current,
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

  // Ascent opens itself: a climb waiting for a keystroke reads as broken
  // rather than as ready. Sprint and Zen wait, because their clocks must not
  // run while the player is still reading the words.
  useEffect(() => {
    if (!engine.startsImmediately) return;
    const id = requestAnimationFrame(() => engine.start(performance.now()));
    return () => cancelAnimationFrame(id);
  }, [engine]);

  // F toggles fullscreen, but never while a run is accepting characters, or
  // the player could not type an F.
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

  // ---- the loop ---------------------------------------------------------
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let completed = false;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const frameMs = now - last;
      last = now;

      engine.advance(now, frameMs);

      const change = qualityRef.current.sample(frameMs);
      if (change) particlesRef.current?.setBudget(PARTICLE_BUDGET[change]);

      const field = fieldRef.current;
      const ascent = engine.state.ascent;

      if (field && ascent && stageRef.current && climberRef.current) {
        const viewport = { width: field.clientWidth, height: field.clientHeight };
        const spacing = viewport.height * 0.15;

        // ---- the camera --------------------------------------------------
        // Anchored to the active platform, and it only ever moves upward.
        // Nothing else is allowed to touch it: no landing shake, no error
        // shake, no tracking of the leap's arc. Every impact goes into the
        // climber instead. It is also still while the player is typing --
        // easing toward the target only during the leap -- so scrolling is
        // interleaved with reading rather than simultaneous.
        const target = ascent.height;
        if (motion.smoothing) {
          const k = 1 - Math.exp(-frameMs / 71);
          cameraRef.current += (target - cameraRef.current) * k;
        } else {
          // Reduced motion keeps the state change and drops the interpolation:
          // one jump-cut per word instead of a continuous scroll.
          cameraRef.current = target;
        }
        // Monotonic, enforced rather than assumed.
        cameraRef.current = Math.max(cameraRef.current, 0);

        stageRef.current.render(
          ascent.visible,
          viewport,
          cameraRef.current,
          ascent.band,
        );

        // ---- the climber -------------------------------------------------
        flinchRef.current = Math.max(0, flinchRef.current - frameMs / 90);
        // The feet come from the renderer, which owns the layout. They sit on
        // the ledge one spacing BELOW the active platform, because the active
        // platform is the one being read and a character standing on it
        // covers the word it is meant to be typing.
        const feetY = AscentStage.feetY(viewport.height);
        const climbX =
          viewport.width * 0.5 +
          (ascent.visible[0]?.offset ?? 0) * spacing * 2;

        climberRef.current.render(
          {
            charge: ascent.charge,
            phase: ascent.phase,
            jump: engine.getSnapshot().jump,
            flinch: motion.effects ? flinchRef.current : 0,
            facing: (ascent.visible[1]?.offset ?? 0) >= 0 ? 1 : -1,
          },
          climbX,
          feetY,
        );

        // ---- the flood ---------------------------------------------------
        const flood = floodRef.current;
        if (flood) {
          // The fail state, literally: the distance on screen between the
          // climber's feet and the water IS the gap. Nothing else to read.
          const clearance = ascent.gap / engine.state.stats.gapMax;
          const surface = feetY + clearance * (viewport.height - feetY);

          // A transform, never a height: the water is a full-height body slid
          // up behind the world. `height` is a layout property, and writing it
          // every frame reflowed the whole field -- and a growing box reads as
          // a bar chart where a rising body of water reads as water.
          flood.style.transform =
            `translate3d(0, ${(surface - WATER_LINE_OFFSET).toFixed(1)}px, 0)`;

          // The last fifth of the gap is where the run is decided, so the
          // water says so. Written only on the crossing, not every frame.
          const danger = clearance < 0.2;
          if (danger !== dangerRef.current) {
            dangerRef.current = danger;
            flood.dataset.danger = danger ? "true" : "false";
          }
        }

        // ---- parallax ----------------------------------------------------
        // Far slower than the camera, and no finer than the eye can track:
        // fine detail scrolling is where vertigo comes from.
        if (motion.background) {
          const drift = cameraRef.current * spacing;
          if (skyRef.current) {
            skyRef.current.style.transform = `translate3d(0, ${(drift * 0.04).toFixed(1)}px, 0)`;
          }
          if (ridgeFarRef.current) {
            ridgeFarRef.current.style.transform = `translate3d(0, ${(drift * 0.08).toFixed(1)}px, 0)`;
          }
          if (ridgeNearRef.current) {
            ridgeNearRef.current.style.transform = `translate3d(0, ${(drift * 0.14).toFixed(1)}px, 0)`;
          }
        }

        // ---- band colours ------------------------------------------------
        // Written as custom properties, and only when the band changes, so a
        // theme switch is a handful of writes rather than a re-render.
        if (appliedBandRef.current !== ascent.band) {
          appliedBandRef.current = ascent.band;
          const theme = bandTheme(ascent.band);
          const board = field.closest(".board") as HTMLElement | null;
          if (board) {
            board.style.setProperty("--slab", theme.slab);
            board.style.setProperty("--slab-edge", theme.slabEdge);
            board.style.setProperty("--word", theme.word);
            board.style.setProperty("--word-done", theme.wordDone);
            board.style.setProperty("--water", theme.water);
            board.style.setProperty("--water-foam", theme.waterFoam);
          }
        }
      }

      particlesRef.current?.step(frameMs);

      // A band boundary is where the draft happens.
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
  }, [engine, motion.smoothing, motion.effects, motion.background, onComplete]);

  // ---- resize -----------------------------------------------------------
  useEffect(() => {
    const onResize = () => particlesRef.current?.resize();
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
  }, []);

  const phase = snapshot?.phase ?? "idle";
  const theme = bandTheme(bandForSky);
  const isAscent = mode === "ascent";

  return (
    <div
      ref={shellRef}
      className="board vignette relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg)]"
    >
      {/* Layer 0: the sky. A plain image, so there is no shader to compile
          before first paint and nothing to fall back from. */}
      {isAscent && (
        <>
          <div
            aria-hidden="true"
            className="sky-fallback absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, ${theme.skyFallback[0]}, ${theme.skyFallback[1]})`,
            }}
          />
          {motion.background && HAS_SKY_ART && (
            <div
              ref={skyRef}
              aria-hidden="true"
              className="sky"
              style={{ backgroundImage: `url(${asset(theme.sky as `/${string}`)})` }}
            />
          )}
          <div
            ref={ridgeFarRef}
            aria-hidden="true"
            className="ridge h-[38%]"
            style={{
              background: `linear-gradient(to top, ${theme.ridges[0]}, transparent)`,
              clipPath:
                "polygon(0 100%, 0 42%, 12% 26%, 24% 46%, 38% 18%, 52% 40%, 66% 22%, 80% 44%, 92% 30%, 100% 48%, 100% 100%)",
            }}
          />
          <div
            ref={ridgeNearRef}
            aria-hidden="true"
            className="ridge h-[22%]"
            style={{
              background: `linear-gradient(to top, ${theme.ridges[1]}, ${theme.ridges[1]})`,
              clipPath:
                "polygon(0 100%, 0 56%, 16% 34%, 30% 58%, 46% 30%, 60% 54%, 74% 32%, 88% 56%, 100% 38%, 100% 100%)",
            }}
          />
        </>
      )}

      {/* The readout strip */}
      <div className="relative z-20 shrink-0 px-5 pt-4 pb-2">
        {snapshot && <Hud snapshot={snapshot} />}
      </div>

      {/* Layer 1: the climb */}
      {/* `overflow-hidden` because the flood is a full viewport tall and slides
          down out of the field -- without it the water paints over the status
          bar below. It also clips the climb at the field edge, which is right. */}
      <div ref={fieldRef} className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {/* Layer 2: dust and sparks */}
        <canvas
          ref={fxRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* The water, back to front: a pale swell behind, the mass of water
            darkening with depth, the sheen of light just under the surface,
            the crest line riding on top, and the warning wash that appears
            close to drowning. Layered because the surface has to sit ON the
            water rather than be a line drawn near it. */}
        {isAscent && (
          <div ref={floodRef} aria-hidden="true" className="flood z-10">
            <div className="flood-swell" />
            <div className="flood-body" />
            <div className="flood-sheen" />
            <div className="flood-surface" />
            <div className="flood-warning" />
          </div>
        )}

        {!isAscent && snapshot && (
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
          display:none — an unfocusable element cannot raise a mobile
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

      {/* Run-level announcements only. Announcing every platform would be
          announcing every word, which floods a screen reader's buffer and
          makes the game genuinely unplayable with one. */}
      <p ref={announceRef} className="visually-hidden" aria-live="polite" aria-atomic="true" />

      {phase === "idle" && (
        <Overlay
          title={isAscent ? "The water is rising" : "Awaiting input"}
          hint={
            isAscent
              ? "Type the word on the platform above to jump to it."
              : "Start typing to open the channel."
          }
          aside="Nothing happening? Click anywhere on the board first."
        />
      )}

      {phase === "paused" && (
        <Overlay
          title="Paused"
          hint="Press Escape or Enter to resume. The water is stopped."
        />
      )}

      {phase === "draft" && snapshot?.draft && (
        <RelicDraft
          offers={snapshot.draft}
          band={snapshot.band}
          onPick={(id) => engine.pickRelic(id)}
          onSkip={() => engine.skipDraft()}
        />
      )}

      {/* The lookahead is a design constant, not a magic number in the
          renderer, so it is asserted rather than duplicated. */}
      <span className="visually-hidden">{`Showing ${LOOKAHEAD} platforms ahead.`}</span>
    </div>
  );
}

function Overlay({
  title,
  hint,
  aside,
}: {
  title: string;
  hint: string;
  aside?: string;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--bg)]/85">
      {/* A solid panel, not a translucent wash. An overlay laid straight over
          the words leaves its own text competing with them and neither is
          readable. */}
      <div className="flex flex-col items-center gap-2 border border-[var(--line-strong)] bg-[var(--bg-panel)] px-8 py-6 text-center">
        <p className="label text-[var(--amber)]">{title}</p>
        <p className="text-sm text-[var(--fg-muted)]">{hint}</p>
        {aside && <p className="mt-1 text-xs text-[var(--fg-faint)]">{aside}</p>}
      </div>
    </div>
  );
}
