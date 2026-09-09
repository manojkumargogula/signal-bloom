"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { CORPORA } from "@/data";
import { makeSeed } from "@/engine/rng";
import type { RunResult } from "@/engine/GameEngine";
import type { ModeId } from "@/engine/types";
import { useIsClient } from "@/react/useIsClient";
import { useServiceWorker } from "@/react/useServiceWorker";
import { useTheme } from "@/react/useTheme";
import { saveRun } from "@/storage/history";
import { Game } from "./Game";
import { Results } from "./results/Results";
import { Kbd, Segmented } from "./ui/Button";
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

const MODES: readonly { value: ModeId; label: string }[] = [
  { value: "onslaught", label: "Onslaught" },
  { value: "sprint", label: "Sprint" },
  { value: "zen", label: "Zen" },
];

const DURATIONS = [
  { value: "15000", label: "15s" },
  { value: "30000", label: "30s" },
  { value: "60000", label: "60s" },
  { value: "120000", label: "120s" },
] as const;

const MODE_HINT: Record<ModeId, string> = {
  onslaught: "Type a word to lock it. Decode it before it reaches you.",
  sprint: "Type the words. The clock starts on your first keystroke.",
  zen: "No timer, no score. Stop whenever you like.",
};

export function AppShell() {
  const [mode, setMode] = useState<ModeId>("onslaught");
  const [corpusId, setCorpusId] = useState("en-common");
  const [durationMs, setDurationMs] = useState(30_000);
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

  const switchMode = useCallback((next: ModeId) => {
    setResult(null);
    setMode(next);
    setSeed(makeSeed());
  }, []);

  const corpusOptions = CORPORA.map((corpus) => ({
    value: corpus.id,
    label: corpus.label.replace(/^[^·]+· /, ""),
  }));

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

          <Segmented options={MODES} value={mode} onChange={switchMode} label="Game mode" />
        </div>

        <div className="flex items-center gap-3">
          {mode === "sprint" && (
            <Segmented
              options={DURATIONS}
              value={String(durationMs) as (typeof DURATIONS)[number]["value"]}
              onChange={(value) => {
                setDurationMs(Number(value));
                setResult(null);
                setSeed(makeSeed());
              }}
              label="Test length"
            />
          )}

          {mode !== "onslaught" && (
            <Segmented
              options={corpusOptions}
              value={corpusId}
              onChange={(value) => {
                setCorpusId(value);
                setResult(null);
                setSeed(makeSeed());
              }}
              label="Word list"
            />
          )}

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
        {isClient && !result && (
          <Game
            key={`${mode}-${seed}-${corpusId}-${durationMs}`}
            mode={mode}
            seed={seed}
            corpusId={mode === "onslaught" ? "en-common" : corpusId}
            durationMs={mode === "sprint" ? durationMs : undefined}
            onComplete={onComplete}
          />
        )}

        {result && (
          <div className="absolute inset-0 overflow-y-auto bg-[var(--bg)]">
            <div className="mx-auto max-w-5xl px-5 py-6">
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
          <span>{result ? "Run complete." : MODE_HINT[mode]}</span>
        )}

        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Esc</Kbd> pause
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>⌫</Kbd> clear word
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
