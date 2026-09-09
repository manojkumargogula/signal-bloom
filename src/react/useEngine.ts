"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { GameEngine, type EngineOptions, type HudSnapshot } from "@/engine/GameEngine";
import type { EngineEvent } from "@/engine/types";

/**
 * Binds an engine instance to React.
 *
 * The subscription uses `useSyncExternalStore` rather than a plain effect for
 * a specific reason: React renders concurrently and can yield partway through
 * a tree, so two sibling HUD widgets reading mutable engine fields during
 * render could commit different values for the same frame. That is real
 * tearing and it looks like a bug in the game. `useSyncExternalStore` re-reads
 * the snapshot immediately before commit and is the only mechanism with a
 * server-snapshot slot, which this app needs because the HUD is pre-rendered.
 *
 * The engine publishes at roughly 10Hz, and only when a displayed value has
 * actually changed, so a stable HUD costs zero renders.
 */
export function useEngineStore(engine: GameEngine | null): HudSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) => (engine ? engine.subscribe(listener) : () => {}),
    [engine],
  );
  const getSnapshot = useCallback(() => (engine ? engine.getSnapshot() : null), [engine]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface UseGameOptions extends Omit<EngineOptions, "onEvent"> {
  onEvent?: (event: EngineEvent) => void;
}

/**
 * Creates an engine and recreates it when the run configuration changes.
 *
 * The engine is held in state rather than a ref so that a restart produces a
 * new identity the subscription can follow.
 */
export function useGame(options: UseGameOptions) {
  const { mode, seed, corpusId, durationMs, wordCount, layoutId } = options;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;

  const [generation, setGeneration] = useState(0);

  const engine = useMemo(() => {
    return new GameEngine({
      mode,
      seed,
      corpusId,
      durationMs,
      wordCount,
      layoutId,
      onEvent: (event) => onEventRef.current?.(event),
    });
    // `generation` is the restart signal: bumping it builds a fresh engine.
  }, [mode, seed, corpusId, durationMs, wordCount, layoutId, generation]);

  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const snapshot = useEngineStore(engine);

  return { engine, snapshot, restart, generation };
}

/** Pauses a run when the tab is hidden, so time away is never counted. */
export function useAutoPause(engine: GameEngine | null): void {
  useEffect(() => {
    if (!engine) return;

    const onHidden = () => {
      if (document.hidden) engine.pause(performance.now());
    };
    const onBlur = () => engine.pause(performance.now());

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
    };
  }, [engine]);
}
