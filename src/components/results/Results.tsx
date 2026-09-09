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
import { History } from "./History";
import { WpmChart } from "./WpmChart";

/**
 * The post-run analysis, on one screen.
 *
 * The results are part of the game, not a document you read afterwards, so
 * they live in the same locked viewport the climb does and nothing scrolls.
 * That single constraint decides the layout: there is no stack ordered by
 * importance and allowed to run off the bottom, because there is no bottom to
 * run off. Every panel gets a share of a fixed height and has to earn it.
 *
 *     +--------------+---------------------------------------+
 *     | the verdict  | accuracy by key                       |
 *     |   167 wpm    +---------------------------------------+
 *     |   figures    | speed over the run                    |
 *     |   diagnosis  |                                       |
 *     |   Again      +--------+--------+---------+-----------+
 *     +--------------+ keys   | pairs  | errors  | recent    |
 *     | finger load  |        |        |         | runs      |
 *     +--------------+--------+--------+---------+-----------+
 *
 * **Two columns, not three.** Three fitted, but the content only came to
 * about two-thirds of three columns of viewport height, so a third of the
 * screen was empty and the speed chart sat in a panel twice its height. Two
 * columns with a strip of small panels along the bottom leaves the slack in
 * one place -- the chart -- which is the panel that can actually use it, and
 * the chart measures its own box so it does.
 *
 * The keyboard is 34rem of content and sets the right column's width; putting
 * it in a side column would have hidden the best diagnostic on the screen
 * behind a horizontal scrollbar.
 *
 * Detail that cannot fit -- the per-second table, the full run list -- stays
 * inside the `<details>` those components already carry. Opening one scrolls
 * its own panel and nothing else, which is why each panel is its own scroll
 * container: the alternatives are clipping the table or letting it push the
 * screen taller, and both break the promise above.
 *
 * Below `lg` the columns cannot coexist and the whole thing scrolls, because
 * a phone has no third option. At `lg` and up it is exactly one screen.
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

  const best = bests[bestKey({ mode: result.mode })];
  const isBest = m.valid && (!best || m.wpm >= best.wpm);

  /**
   * One sentence naming the most useful thing in the run.
   *
   * It has to say what actually made the item rank. A key can top the list on
   * hesitation alone with perfect accuracy, so calling that a "weakest key at
   * 100% accuracy" is nonsense the player will notice immediately.
   */
  const diagnosis = useMemo(() => {
    const bigram = m.problemBigrams[0];
    const key = m.problemKeys[0];

    if (bigram && (!key || bigram.costMs >= key.costMs)) {
      return bigram.accuracy < 1
        ? `The pair “${bigram.label}” cost you the most: ${(bigram.accuracy * 100).toFixed(0)}% accurate, about ${Math.round(bigram.costMs)}ms lost each time.`
        : `You typed “${bigram.label}” accurately but slowly — about ${Math.round(bigram.costMs)}ms behind your usual pace.`;
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
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="grid min-h-full gap-3 p-4 lg:h-full lg:min-h-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* ---- the verdict ---------------------------------------------- */}
        {/* `minmax(0,1fr)` rather than `1fr` throughout: a bare `1fr` floors
            at its content's min-height, which lets a wide chart or a long
            table push a column past the viewport instead of fitting in it. */}
        <div className="grid gap-3 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
          <Panel className="flex flex-col gap-3">
            <div>
              {isBest && m.valid && (
                <p className="label mb-1 text-[var(--amber)]">Personal best</p>
              )}
              <div className="flex items-baseline gap-2">
                <span className="num text-7xl font-semibold leading-none text-[var(--amber)]">
                  {Math.round(m.wpm)}
                </span>
                <span className="label">wpm</span>
              </div>
              <p className="num mt-1.5 text-xs text-[var(--fg-muted)]">
                {m.charCounts.correctFinal} correct chars ·{" "}
                {(m.durationMs / 1000).toFixed(1)}s
                {m.pausedMs > 500 && ` · ${(m.pausedMs / 1000).toFixed(0)}s paused`}
              </p>
            </div>

            <dl className="grid grid-cols-3 gap-x-3 border-t border-[var(--line)] pt-3">
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

            {result.ascent && (
              <p className="num border-t border-[var(--line)] pt-3 text-xs leading-relaxed text-[var(--fg-muted)]">
                <Stat>{result.ascent.height}</Stat> platforms · band{" "}
                <Stat>{result.ascent.band}</Stat> ·{" "}
                <Stat>{result.ascent.score.toLocaleString()}</Stat> points ·{" "}
                <Stat>{`×${result.ascent.comboBest}`}</Stat> combo
              </p>
            )}

            {diagnosis && (
              <p className="border-t border-[var(--line)] pt-3 text-xs leading-relaxed text-[var(--fg-muted)]">
                {diagnosis}
              </p>
            )}

            {!m.valid && (
              <p className="border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-3 py-2 text-xs leading-relaxed text-[var(--fg)]">
                <strong className="font-semibold">No record.</strong>{" "}
                {invalidExplanation(m.invalidReasons)}
              </p>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={onAgain}>
                Again
              </Button>
              <Link
                href="/metrics/"
                className="text-xs text-[var(--fg-muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
              >
                What these mean
              </Link>
            </div>
          </Panel>

          <Panel>
            <FingerChart byFinger={m.byFinger} />
          </Panel>
        </div>

        {/* ---- the run --------------------------------------------------- */}
        <div className="grid gap-3 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
          <Panel>
            <Heatmap byCode={m.byCode} />
          </Panel>

          <Panel>
            <WpmChart series={m.series} />
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Panel>
              <ProblemList title="Slowest keys" items={m.problemKeys} />
            </Panel>
            <Panel>
              <ProblemList title="Slowest pairs" items={m.problemBigrams} />
            </Panel>
            <Panel>
              <ErrorCounts counts={m.errorEvents} corrected={m.charCounts.corrected} />
            </Panel>
            <Panel>
              <History mode={result.mode} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One panel of the dashboard.
 *
 * Its own scroll container, so a `<details>` opening inside it never changes
 * the height of anything outside it.
 */
function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`min-h-0 overflow-y-auto border border-[var(--line)] bg-[var(--bg-panel)] p-4 ${className}`}
    >
      {children}
    </section>
  );
}

/** A figure inside a sentence, for numbers that are context rather than headline. */
function Stat({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[var(--fg)]">{children}</span>;
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd
        className={`num mt-0.5 text-lg font-semibold ${
          tone === "warn" ? "text-[var(--fault)]" : "text-[var(--fg)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * A ranked cost list, trimmed to what fits.
 *
 * Three rows rather than five. On a fixed-height screen a list that overflows
 * its panel is worse than a shorter one, and the fourth and fifth entries
 * were never the ones anybody acted on.
 */
function ProblemList({
  title,
  items,
}: {
  title: string;
  items: RunResult["metrics"]["problemKeys"];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--fg)]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">
          Nothing stood out here.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {items.slice(0, 3).map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-xs">
              <span className="type-surface shrink-0 border border-[var(--line-strong)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-center text-[var(--fg)]">
                {item.label === " " ? "␣" : item.label}
              </span>
              <span className="num flex-1 truncate text-[var(--fg-muted)]">
                {(item.accuracy * 100).toFixed(0)}% of {item.attempts}
              </span>
              <span className="num shrink-0 text-[var(--amber-dim)]">
                −{Math.round(item.costMs)}ms
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ErrorCounts({
  counts,
  corrected,
}: {
  counts: RunResult["metrics"]["errorEvents"];
  corrected: number;
}) {
  const total =
    counts.substitution + counts.omission + counts.insertion + counts.transposition;

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--fg)]">What went wrong</h3>
      {total === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">
          No mistyped characters at all.
        </p>
      ) : (
        <>
          <dl className="num mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs text-[var(--fg-muted)]">
            <Row label="Substitutions" value={counts.substitution} />
            <Row label="Omissions" value={counts.omission} />
            <Row label="Insertions" value={counts.insertion} />
            <Row label="Transpositions" value={counts.transposition} />
          </dl>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--fg-faint)]">
            A transposition is two letters swapped — counted once, though it cost two
            keystrokes. You corrected {corrected}, which helped your speed but not your
            accuracy.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="truncate">{label}</dt>
      <dd className="text-right text-[var(--fg)]">{value}</dd>
    </>
  );
}

/**
 * Why a run cannot set a record.
 *
 * These carry the whole notice, so each one has to say what happened AND that
 * the figures above are still real -- the numbers are always measured, it is
 * only the record that is withheld.
 */
function invalidExplanation(reasons: readonly string[]): string {
  if (reasons.includes("paste")) return "Text was pasted rather than typed.";
  if (reasons.includes("too-short")) return "Too short to measure reliably.";
  if (reasons.includes("idle-gap")) return "There was a long pause mid-run.";
  if (reasons.includes("implausible-accuracy"))
    return "The accuracy is too low to be real typing.";
  if (reasons.includes("synthetic-input"))
    return "Too much input arrived without a keypress.";
  return "This run could not be measured reliably.";
}
