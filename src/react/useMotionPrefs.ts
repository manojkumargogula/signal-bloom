"use client";

import { useEffect, useState } from "react";

/**
 * Motion preferences, split three ways.
 *
 * `prefers-reduced-motion` cannot mean "no motion" in a game — transmissions
 * have to approach or there is nothing to play. So the OS flag defaults three
 * independent switches, and entity motion is deliberately not one of them:
 *
 *   background  the ambient shader; becomes a static gradient
 *   effects     screen shake, flashes, particle volume
 *   smoothing   interpolation and easing; motion becomes direct
 */
export interface MotionPrefs {
  background: boolean;
  effects: boolean;
  smoothing: boolean;
}

const FULL: MotionPrefs = { background: true, effects: true, smoothing: true };
const REDUCED: MotionPrefs = { background: false, effects: false, smoothing: false };

export function useMotionPrefs(): MotionPrefs {
  const [prefs, setPrefs] = useState<MotionPrefs>(FULL);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefs(query.matches ? REDUCED : FULL);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return prefs;
}
