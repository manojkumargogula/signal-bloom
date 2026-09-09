"use client";

import { useSyncExternalStore } from "react";

/** Never fires: whether we are on the client does not change. */
const subscribe = () => () => {};

/**
 * True once React is rendering on the client.
 *
 * The sanctioned way to gate client-only content without a mount effect.
 * `useSyncExternalStore` uses the server snapshot for the hydrating render and
 * the client snapshot for every render after it, so the first client render
 * matches the server exactly and the switch happens in the normal re-render
 * rather than as a cascading update from an effect.
 *
 * Needed here because a run's seed is random, and a randomly seeded word list
 * rendered on the server would never match the one the client generates.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
