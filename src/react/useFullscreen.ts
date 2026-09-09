"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Fullscreen, with the focus handling that browser games usually get wrong.
 *
 * Entering fullscreen moves focus to the fullscreen element, so keystrokes
 * stop reaching a hidden input and the game silently stops responding. The
 * fix is to re-focus the capture surface inside the `fullscreenchange`
 * handler, in both directions.
 */
export function useFullscreen(
  target: RefObject<HTMLElement | null>,
  refocus: RefObject<HTMLElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement !== null;
      setIsFullscreen(active);
      // Both directions: leaving fullscreen also moves focus.
      requestAnimationFrame(() => refocus.current?.focus({ preventScroll: true }));
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("fullscreenerror", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("fullscreenerror", onChange);
    };
  }, [refocus]);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.current?.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by policy or refused outside a gesture.
      // The game is fully playable windowed, so this is not worth surfacing.
    }
  }, [target]);

  return { isFullscreen, toggle };
}
