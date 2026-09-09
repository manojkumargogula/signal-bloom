"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  clearHistory,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  subscribeHistory,
  type HistoryEntry,
} from "@/storage/history";

/**
 * Recent runs, with a trend.
 *
 * The point of keeping history at all is seeing whether you are getting
 * better, so the sparkline is the content and the table is the detail. Only
 * valid runs of the same mode are compared -- a 15-second Sprint and a
 * 120-second one are not the same measurement, and mixing them would produce
 * a trend line that means nothing.
 */

const MAX_SHOWN = 12;

export function History({ mode, durationMs }: { mode: string; durationMs?: number }) {
  const all = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );

  const runs = useMemo(() => {
    return all
      .filter((run) => run.mode === mode && run.metrics.valid)
      .filter((run) => {
        if (durationMs === undefined) return true;
        // Within a second, since the recorded duration is measured rather
        // than nominal.
        return Math.abs(run.metrics.durationMs - durationMs) < 1500;
      })
      .slice(-MAX_SHOWN);
  }, [all, mode, durationMs]);

  if (runs.length < 2) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        {runs.length === 0
          ? "This is your first recorded run in this mode."
          : "One run recorded. A second will start the trend."}
      </p>
    );
  }

  const speeds = runs.map((run) => run.metrics.wpm);
  const best = Math.max(...speeds);
  const worst = Math.min(...speeds);
  const span = Math.max(best - worst, 1);

  // Compared against the runs before this one, not against the all-time best:
  // "up 4 on your recent average" is actionable, "12 below your record" is
  // just discouraging.
  const latest = speeds[speeds.length - 1];
  const priorAverage =
    speeds.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(speeds.length - 1, 1);
  const delta = latest - priorAverage;

  const W = 420;
  const H = 64;
  const step = W / Math.max(speeds.length - 1, 1);
  const points = speeds
    .map((wpm, i) => `${(i * step).toFixed(1)},${(H - ((wpm - worst) / span) * (H - 8) - 4).toFixed(1)}`)
    .join(" ");

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--fg)]">
          Your last {runs.length} runs
        </h3>
        <span className="num text-xs text-[var(--fg-muted)]">
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)} WPM on your recent average
        </span>
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Speed across your last ${runs.length} runs, from ${Math.round(worst)} to ${Math.round(best)} words per minute. The most recent is ${Math.round(latest)}.`}
          className="h-16 w-full min-w-[18rem]"
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--series-net)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {speeds.map((wpm, i) => (
            <circle
              key={i}
              cx={i * step}
              cy={H - ((wpm - worst) / span) * (H - 8) - 4}
              r={i === speeds.length - 1 ? 3.5 : 2}
              fill={i === speeds.length - 1 ? "var(--amber)" : "var(--series-raw)"}
            />
          ))}
        </svg>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
          View as table
        </summary>
        <table className="num mt-2 w-full text-left text-xs">
          <caption className="sr-only">Your recorded runs in this mode</caption>
          <thead className="text-[var(--fg-faint)]">
            <tr>
              <th scope="col" className="py-1 pr-4 font-semibold">When</th>
              <th scope="col" className="py-1 pr-4 font-semibold">WPM</th>
              <th scope="col" className="py-1 pr-4 font-semibold">Accuracy</th>
              <th scope="col" className="py-1 font-semibold">Consistency</th>
            </tr>
          </thead>
          <tbody className="text-[var(--fg-muted)]">
            {[...runs].reverse().map((run) => (
              <tr key={run.id}>
                <td className="py-0.5 pr-4">{formatWhen(run)}</td>
                <td className="py-0.5 pr-4">{Math.round(run.metrics.wpm)}</td>
                <td className="py-0.5 pr-4">{run.metrics.accuracy.toFixed(1)}%</td>
                <td className="py-0.5">
                  {run.metrics.consistency === null
                    ? "—"
                    : `${Math.round(run.metrics.consistency)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={() => {
            clearHistory();
          }}
          className="mt-4 border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--fg-muted)] transition-colors hover:border-[var(--fault)] hover:text-[var(--fault)]"
        >
          Clear all history
        </button>
      </details>
    </figure>
  );
}

/**
 * Formatted through Intl rather than by hand, so the date reads correctly
 * outside one locale.
 */
function formatWhen(run: HistoryEntry): string {
  const when = new Date(run.startedAt);
  const today = new Date();
  const sameDay =
    when.getFullYear() === today.getFullYear() &&
    when.getMonth() === today.getMonth() &&
    when.getDate() === today.getDate();

  return sameDay
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(when)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(when);
}
