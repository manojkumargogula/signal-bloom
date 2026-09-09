"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_CORPUS_ID } from "@/data";
import { makeSeed } from "@/engine/rng";
import type { RunResult } from "@/engine/GameEngine";
import { useIsClient } from "@/react/useIsClient";
import { useServiceWorker } from "@/react/useServiceWorker";
import { useTheme } from "@/react/useTheme";
import { saveRun } from "@/storage/history";
import { Game } from "./Game";
import { Results } from "./results/Results";
import { Kbd } from "./ui/Button";
import { Wordmark } from "./site/Wordmark";

/**
 * The whole application, on one screen.
 *
 * The game IS the page. There is no landing page in front of it and nothing
 * scrolls at the document level: the shell is exactly one viewport tall, the
 * field takes every pixel that is left after a thin bar at each end, and the
 * results arrive as an overlay over the field rather than as a new page.
 *
 * Prose that search and answer engines need lives on the dedicated content
 * routes, which are ordinary scrolling documents. This screen carries only
 * its heading.
 */

export function AppShell() {
  const [result, setResult] = useState<RunResult | null>(null);
  const { resolved, cycle } = useTheme();
  const { update, applyUpdate } = useServiceWorker();
  const shellRef = useRef<HTMLDivElement>(null);

  // A run's seed is random, and the word list is derived from it, so the
  // server could never render the same words the client generates. The board
  // is therefore held back for the hydrating render and appears in the
  // ordinary re-render that follows -- not from a mount effect, which would
  // cascade.
  const isClient = useIsClient();
  const [seed, setSeed] = useState(() => makeSeed());

  const onComplete = useCallback((run: RunResult) => {
    setResult(run);
    saveRun(run);
  }, []);

  const again = useCallback(() => {
    setResult(null);
    setSeed(makeSeed());
  }, []);

  return (
    <div ref={shellRef} className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--bg)]">
      {/* -------------------------------------------------------- top bar -- */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex items-center gap-5">
          {/* The page's heading. Small, because the game is the subject -- but
              a real h1, because the document still needs one. */}
          <h1 className="m-0">
            <Wordmark />
            <span className="visually-hidden">
              Signal Bloom — a typing game with real typing analysis
            </span>
          </h1>
        </div>

        {/* Nothing else. There was a mode picker, a duration picker and a word
            list picker here; with one untimed game and one word pool, every
            one of them was a control with a single value. */}
        <div className="flex items-center gap-3">
          <button
            onClick={cycle}
            aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
            className="border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--fg-muted)] transition-colors hover:border-[var(--amber)] hover:text-[var(--amber)]"
          >
            {resolved === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------- board -- */}
      <div className="relative min-h-0 flex-1">
        {/* The board stays mounted after the run ends. `advance` does not step
            the simulation once the phase is "over", so what remains on screen
            is the frozen moment the water caught you -- with the surface still
            lapping at it, because the render loop keeps drawing. Unmounting it
            threw that away and replaced the world with a page of numbers. */}
        {isClient && (
          <Game key={seed} seed={seed} corpusId={DEFAULT_CORPUS_ID} onComplete={onComplete} />
        )}

        {/* And the analysis is laid over it, in the same locked viewport and
            with no scroll container. The panels are opaque, so every contrast
            pair still holds; what shows through is the space between them,
            which is where you drowned. */}
        {/* `z-30` is load-bearing. The board's own field layer sits at z-10
            and its readout strip at z-20, and because the board itself has no
            z-index it is not a stacking context -- so those children compete
            with this overlay directly, and both painted OVER it. The analysis
            was drawn but unreachable: the Again button was visible and every
            click landed on the field behind it. */}
        {result && (
          <div className="absolute inset-0 z-30 overflow-hidden">
            {/* The scrim. Heavy, and heavier at the top: at 78% the world
                competed with the panels rather than sitting behind them, and
                what the eye caught was a platform fragment in a gap reading
                as an artifact. The gradient keeps the water -- the part that
                says where the run ended -- the most legible thing back
                there, and quietens the geometry above it. */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom," +
                  " color-mix(in oklab, var(--bg) 94%, transparent) 0%," +
                  " color-mix(in oklab, var(--bg) 90%, transparent) 55%," +
                  " color-mix(in oklab, var(--bg) 76%, transparent) 100%)",
              }}
            />
            <div className="relative h-full">
              <Results result={result} onAgain={again} />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ status bar -- */}
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--fg-muted)]">
        {update === "available" ? (
          <span className="flex items-center gap-2">
            <span className="text-[var(--amber)]">A new version is ready.</span>
            <button
              onClick={applyUpdate}
              className="border border-[var(--amber)] px-2 py-0.5 text-[var(--amber)] transition-colors hover:bg-[var(--amber)] hover:text-[var(--bg)]"
            >
              Reload
            </button>
          </span>
        ) : (
          <span>
            {result
              ? "Run complete."
              : "Type the word on the platform above. The water is rising."}
          </span>
        )}

        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Esc</Kbd> pause
          </span>
          <Link
            href="/metrics/"
            className="transition-colors hover:text-[var(--amber)]"
          >
            What the numbers mean
          </Link>
          <Link href="/how-it-works/" className="transition-colors hover:text-[var(--amber)]">
            About
          </Link>
        </div>
      </footer>
    </div>
  );
}
