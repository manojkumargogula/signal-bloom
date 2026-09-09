"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemeChoice = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "signalbloom:v1:theme";

/**
 * The inline script that resolves the theme before first paint.
 *
 * Without it the page renders in the default theme and then snaps to the
 * player's choice, which is both ugly and a layout-stability problem. It has
 * to be inline and blocking, so it lives here as a single exported string:
 * one source feeds the script tag and, if a CSP is ever added, its hash.
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

/**
 * The theme, as an external store rather than as React state.
 *
 * It genuinely is external: the authoritative value lives on the document
 * element (written before React ever runs, by the script above), backed by
 * localStorage and by the OS preference. Mirroring that into `useState` and
 * syncing it in an effect would mean two sources of truth, a render with the
 * wrong value, and a cascading re-render on mount.
 */

type Resolved = "dark" | "light";

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function systemTheme(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Private browsing can refuse the read. The OS preference still applies.
  }
  return "system";
}

function resolve(choice: ThemeChoice): Resolved {
  return choice === "system" ? systemTheme() : choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Follow the OS while no explicit choice is stored.
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemChange = () => {
    if (readChoice() === "system") {
      apply(systemTheme());
      notify();
    }
  };
  query.addEventListener("change", onSystemChange);

  // Another tab changing the theme should be followed here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      apply(resolve(readChoice()));
      notify();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

function apply(resolved: Resolved): void {
  document.documentElement.dataset.theme = resolved;
}

/**
 * The snapshot is read off the document element, which the pre-paint script
 * has already stamped. That is what makes the first client render agree with
 * the server render and with what is actually on screen.
 */
function getSnapshot(): Resolved {
  const stamped = document.documentElement.dataset.theme;
  return stamped === "light" ? "light" : "dark";
}

function getServerSnapshot(): Resolved {
  return "dark";
}

export function useTheme() {
  const resolved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing rejects the write. The theme still applies for this
      // session; only the memory of it is lost.
    }
    apply(resolve(next));
    notify();
  }, []);

  const cycle = useCallback(() => {
    set(resolved === "dark" ? "light" : "dark");
  }, [resolved, set]);

  return { resolved, set, cycle };
}
