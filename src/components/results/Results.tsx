"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import type { RunResult } from "@/engine/GameEngine";
import {
  bestKey,
  getBestsServerSnapshot,
  getBestsSnapshot,
  subscribeBests,
} from "@/storage/history";
import { Button } from "../ui/Button";
import { FingerChart } from "./FingerChart";
import { Heatmap } from "./Heatmap";
import { WpmChart } from "./WpmChart";

/**
 * The post-run analysis.
 *
 * Structured so the headline is unmissable and the detail is beneath it: most
 * players want the number, some want the diagnosis, and both should get what
 * they came for without hunting.
 */

interface ResultsProps {
  result: RunResult;
  onAgain: () => void;
}

export function Results({ result, onAgain }: ResultsProps) {
  const m = result.metrics;

  // Read through a store rather than mirrored into state: localStorage cannot
  // be touched during render, and an effect that copies it in would give the
  // first paint a value already known to be wrong.
  const bests = useSyncExternalStore(
    subscribeBests,
    getBestsSnapshot,
    getBestsServerSnapshot,
  );

  // The run is saved before this screen renders, so its own entry is already
  // in place; equality means this run set the record.
  const best = bests[bestKey({ mode: result.mode, durationMs: m.durationMs })];
  const isBest = m.valid && (!best || m.wpm >= best.wpm);

  /**
   * One sentence naming the most useful thing in the run.
   *
   * It has to say what actually made the item rank. A key can top the list on
   * hesitation alone with perfect accuracy, so calling that a "weakest key at
   * 100% accuracy" is nonsense the player will notice immediately.
   */
  const problemSummary = useMemo(() => {
    const bigram = m.problemBigrams[0];
    const key = m.problemKeys[0];

    if (bigram && (!key || bigram.costMs >= key.costMs)) {
      return bigram.accuracy < 1
        ? `The pair “${bigram.label}” cost you the most: ${(bigram.accuracy * 100).toFixed(0)}% accurate, about ${Math.round(bigram.costMs)}ms lost each time.`
        : `You typed “${bigram.label}” accurately but slowly — about ${Math.round(bigram.costMs)}ms behind your usual pace each time.`;
    }

    if (key) {
      return key.accuracy < 1
        ? `${key.label} was your weakest key: ${(key.accuracy * 100).toFixed(0)}% accurate over ${key.attempts} presses.`
        : `You hit ${key.label} accurately but hesitated before it — about ${Math.round(key.costMs)}ms each time.`;
    }

    if (m.accuracy === 100) return "A clean run. Nothing stood out as costing you time.";
    return null;
  }, [m.problemBigrams, m.problemKeys, m.accuracy]);

  return (
    <div className="flex flex-col gap-8">
      {/* Headline */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            {isBest && m.valid && (
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--amber)]">
                Personal best
              </p>
            )}
            <div className="flex items-baseline gap-3">
              <span className="num text-6xl font-semibold leading-none text-[var(--amber)] sm:text-7xl">
                {Math.round(m.wpm)}
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--fg-faint)]">
                wpm
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              {m.charCounts.correctFinal} correct characters in{" "}
              {(m.durationMs / 1000).toFixed(1)}s
              {m.pausedMs > 500 && `, plus ${(m.pausedMs / 1000).toFixed(0)}s paused and not counted`}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-x-8 gap-y-3">
            <Figure label="Raw" value={String(Math.round(m.rawWpm))} />
            <Figure
              label="Accuracy"
              value={`${m.accuracy.toFixed(1)}%`}
              tone={m.accuracy < 90 ? "warn" : undefined}
            />
            <Figure
              label="Consistency"
              value={m.consistency === null ? "—" : `${Math.round(m.consistency)}%`}
            />
          </dl>
        </div>

        {problemSummary && (
          <p className="mt-6 border-t border-[var(--line)] pt-4 text-sm text-[var(--fg-muted)]">
            {problemSummary}
          </p>
        )}

        {!m.valid && (
          <p className="mt-4 border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-4 py-3 text-sm text-[var(--fg)]">
            <strong className="font-semibold">Not counted.</strong>{" "}
            {invalidExplanation(m.invalidReasons)} The numbers above are still real; this run just
            will not set a record or feed your key statistics.
          </p>
        )}

        {result.onslaught && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-[var(--line)] pt-4 sm:grid-cols-4">
            <Figure label="Wave" value={String(result.onslaught.wave)} />
            <Figure label="Score" value={result.onslaught.score.toLocaleString()} />
            <Figure label="Best combo" value={`×${result.onslaught.comboBest}`} />
            <Figure label="Decoded" value={String(result.onslaught.decoded)} />
          </dl>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onAgain}>
            Again
          </Button>
          <Link
            href="/metrics/"
            className="text-sm text-[var(--fg-muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
          >
            What do these numbers mean?
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6">
        <WpmChart series={m.series} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6">
          <Heatmap byCode={m.byCode} />
        </section>
        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6">
          <FingerChart byFinger={m.byFinger} />
        </section>
      </div>

      {(m.problemKeys.length > 0 || m.problemBigrams.length > 0) && (
        <section className="grid gap-6 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6 sm:grid-cols-2">
          <ProblemList
            title="Keys costing you time"
            note="Ranked by estimated time lost, combining hesitation with a confidence-weighted error rate."
            items={m.problemKeys}
          />
          <ProblemList
            title="Letter pairs costing you time"
            note="Pairs are usually more revealing than single keys: awkward rolls and hand alternations only show up here."
            items={m.problemBigrams}
          />
        </section>
      )}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6">
        <h3 className="text-sm font-semibold text-[var(--fg)]">What went wrong</h3>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Figure label="Substitutions" value={String(m.errorEvents.substitution)} />
          <Figure label="Omissions" value={String(m.errorEvents.omission)} />
          <Figure label="Insertions" value={String(m.errorEvents.insertion)} />
          <Figure label="Transpositions" value={String(m.errorEvents.transposition)} />
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[var(--fg-muted)]">
          A transposition is two letters typed in the wrong order — counted once here, though it
          cost two keystrokes. Corrections are counted separately: you fixed{" "}
          {m.charCounts.corrected} character{m.charCounts.corrected === 1 ? "" : "s"}, which helped
          your net speed but not your accuracy.
        </p>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[var(--fg-faint)]">
        {label}
      </dt>
      <dd
        className={`num mt-0.5 text-xl font-semibold ${
          tone === "warn" ? "text-[var(--fault)]" : "text-[var(--fg)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ProblemList({
  title,
  note,
  items,
}: {
  title: string;
  note: string;
  items: RunResult["metrics"]["problemKeys"];
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-[var(--fg)]">{title}</h3>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Nothing stood out. Either the run was clean or it was too short to tell.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--fg)]">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{note}</p>
      <ol className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 text-sm">
            <span className="type-surface w-10 shrink-0 rounded border border-[var(--line-strong)] bg-[var(--bg-inset)] py-1 text-center text-[var(--fg)]">
              {item.label === " " ? "␣" : item.label}
            </span>
            <span className="num flex-1 text-[var(--fg-muted)]">
              {(item.accuracy * 100).toFixed(0)}% over {item.attempts}
              {item.meanLatency !== null && ` · ${Math.round(item.meanLatency)}ms`}
            </span>
            <span className="num shrink-0 text-[var(--amber-dim)]">
              −{Math.round(item.costMs)}ms
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function invalidExplanation(reasons: readonly string[]): string {
  if (reasons.includes("paste")) return "Text was pasted rather than typed.";
  if (reasons.includes("too-short")) return "The run was too short to measure.";
  if (reasons.includes("idle-gap")) return "There was a long pause in the middle.";
  if (reasons.includes("implausible-accuracy")) return "The accuracy was too low to be real typing.";
  if (reasons.includes("synthetic-input")) return "Too much of the input arrived without a keypress.";
  return "Something about this run could not be measured reliably.";
}
