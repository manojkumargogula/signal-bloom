"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "signalbloom:v1:theme";

/**
 * The inline script that resolves the theme before first paint.
 *
 * Without this the page renders in the default theme and then snaps to the
 * player's choice, which is both ugly and a layout-stability problem. It has
 * to be inline and blocking, so it is kept as a single exported string: the
 * same source feeds the script tag and the CSP hash.
 */
export const THEME_INIT_SCRIPT = `
try {
  var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
  var choice = stored === 'dark' || stored === 'light' ? stored
    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = choice;
} catch (e) {
  document.documentElement.dataset.theme = 'dark';
}
`.trim();

function systemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  // Read after mount only: touching localStorage during render would produce
  // a different tree on the server and on the client.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const next: ThemeChoice = stored === "dark" || stored === "light" ? stored : "system";
    setChoice(next);
    setResolved(next === "system" ? systemTheme() : next);
  }, []);

  // Follow the system while the player has not chosen explicitly.
  useEffect(() => {
    if (choice !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolved(query.matches ? "light" : "dark");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const set = useCallback((next: ThemeChoice) => {
    setChoice(next);
    setResolved(next === "system" ? systemTheme() : next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing rejects writes. The theme still applies for this
      // session; only the memory of it is lost.
    }
  }, []);

  const cycle = useCallback(() => {
    set(resolved === "dark" ? "light" : "dark");
  }, [resolved, set]);

  return { choice, resolved, set, cycle };
}
