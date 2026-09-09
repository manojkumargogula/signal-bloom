"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { GameEngine, type EngineOptions, type HudSnapshot } from "@/engine/GameEngine";
import type { EngineEvent } from "@/engine/types";

/**
 * Binds an engine instance to React.
 *
 * The subscription uses `useSyncExternalStore` for a specific reason, not
 * because it is idiomatic. React renders concurrently and can yield partway
 * through a tree, so two sibling HUD widgets reading mutable engine fields
 * during render could commit different values for the same frame. That is
 * real tearing and it looks like a bug in the game. `useSyncExternalStore`
 * re-reads the snapshot immediately before commit, and it is the only
 * mechanism with a server-snapshot slot, which this app needs because the
 * shell is pre-rendered.
 *
 * The engine publishes at roughly 10Hz and only when a displayed value has
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
 * Creates the engine for a run.
 *
 * Exactly once. The run configuration is not watched here and does not need
 * to be: `AppShell` gives `<Game>` a key derived from the mode, seed, word
 * list and duration, so a configuration change remounts the component and
 * this hook builds a fresh engine on the way in. Rebuilding inside an effect
 * instead would mean an extra render and a frame of the old run still on
 * screen.
 *
 * The event handler is attached in an effect rather than passed through a
 * ref. Reading or writing a ref during render is a correctness hazard under
 * concurrent rendering, and the engine only emits after `start`, which is
 * always after mount — so the effect is early enough.
 */
export function useGame(options: UseGameOptions) {
  const { mode, seed, corpusId, durationMs, wordCount, layoutId, onEvent } = options;

  const [engine] = useState(
    () => new GameEngine({ mode, seed, corpusId, durationMs, wordCount, layoutId }),
  );

  useEffect(() => {
    engine.setEventHandler(onEvent);
    return () => engine.setEventHandler(undefined);
  }, [engine, onEvent]);

  const snapshot = useEngineStore(engine);

  return { engine, snapshot };
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
