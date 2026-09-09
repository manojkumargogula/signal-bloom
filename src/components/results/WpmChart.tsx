"use client";

import { useId, useMemo, useState } from "react";
import type { SecondSample } from "@/analytics/types";

/**
 * Per-second speed over the run.
 *
 * Hand-authored inline SVG rather than a chart library: two series over at
 * most 120 points does not justify 40KB of JavaScript, and the marks need to
 * follow the theme tokens.
 *
 * Net is a running average, so it settles; raw is instantaneous, so it spikes.
 * Both on ONE axis -- they share a unit, and a second scale would make the
 * comparison a lie. A table view is provided for assistive technology, and
 * both series are directly labelled so identity is never colour alone.
 */

const W = 720;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

interface WpmChartProps {
  series: readonly SecondSample[];
}

export function WpmChart({ series }: WpmChartProps) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => series.filter((s) => !s.partial), [series]);

  const { netPath, rawPath, maxY, xOf, yOf, ticks } = useMemo(() => {
    const max = Math.max(40, ...points.map((p) => Math.max(p.raw, p.net))) * 1.12;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = Math.max(1, points.length - 1);

    const x = (i: number) => PAD.left + (i / n) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

    const line = (get: (p: SecondSample) => number) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");

    const step = max > 160 ? 50 : max > 80 ? 25 : 20;
    const tickValues: number[] = [];
    for (let v = 0; v <= max; v += step) tickValues.push(v);

    return {
      netPath: line((p) => p.net),
      rawPath: line((p) => p.raw),
      maxY: max,
      xOf: x,
      yOf: y,
      ticks: tickValues,
    };
  }, [points]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Too short to chart. A run needs at least two full seconds.
      </p>
    );
  }

  const active = hover === null ? null : points[hover];

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]">Speed over the run</h3>
        <span className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full bg-[var(--series-net)]" />
            <span className="text-[var(--fg-muted)]">Net</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full bg-[var(--series-raw)]" />
            <span className="text-[var(--fg-muted)]">Raw</span>
          </span>
        </span>
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="h-auto w-full min-w-[32rem]"
          onMouseLeave={() => setHover(null)}
        >
          <title id={titleId}>
            {`Net speed moved from ${Math.round(points[0].net)} to ${Math.round(
              points[points.length - 1].net,
            )} words per minute over ${points.length} seconds. Raw speed peaked at ${Math.round(
              Math.max(...points.map((p) => p.raw)),
            )}.`}
          </title>

          {/* Grid stays recessive: it is a reference, not content. */}
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yOf(value)}
                y2={yOf(value)}
                stroke="var(--series-grid)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yOf(value)}
                textAnchor="end"
                dominantBaseline="middle"
                className="num"
                fontSize="10"
                fill="var(--fg-faint)"
              >
                {value}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yOf(0)}
            y2={yOf(0)}
            stroke="var(--line-strong)"
            strokeWidth="1"
          />

          <path d={rawPath} fill="none" stroke="var(--series-raw)" strokeWidth="2" strokeLinejoin="round" />
          <path d={netPath} fill="none" stroke="var(--series-net)" strokeWidth="2" strokeLinejoin="round" />

          {/* Errors marked on the baseline, so a mistake is visible in time
              rather than only in the totals. */}
          {points.map((p, i) =>
            p.errors > 0 ? (
              <circle
                key={i}
                cx={xOf(i)}
                cy={yOf(0)}
                r={2.5 + Math.min(p.errors, 4)}
                fill="var(--fault)"
                opacity="0.75"
              />
            ) : null,
          )}

          {/* Hit targets are wider than the marks so hovering is forgiving. */}
          {points.map((p, i) => (
            <rect
              key={`hit${i}`}
              x={xOf(i) - 6}
              y={PAD.top}
              width={12}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {active && hover !== null && (
            <g pointerEvents="none">
              <line
                x1={xOf(hover)}
                x2={xOf(hover)}
                y1={PAD.top}
                y2={yOf(0)}
                stroke="var(--fg-faint)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle cx={xOf(hover)} cy={yOf(active.raw)} r="4" fill="var(--series-raw)"
                stroke="var(--bg-panel)" strokeWidth="2" />
              <circle cx={xOf(hover)} cy={yOf(active.net)} r="4" fill="var(--series-net)"
                stroke="var(--bg-panel)" strokeWidth="2" />
            </g>
          )}

          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            fontSize="10"
            fill="var(--fg-faint)"
          >
            seconds
          </text>
        </svg>
      </div>

      <div className="num mt-2 h-5 text-xs text-[var(--fg-muted)]">
        {active
          ? `${active.second}s — net ${Math.round(active.net)} · raw ${Math.round(active.raw)}${
              active.errors > 0 ? ` · ${active.errors} error${active.errors > 1 ? "s" : ""}` : ""
            }`
          : ""}
      </div>

      {/* The same data as a table, so the chart is not the only way in. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
          View as table
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="num w-full text-left text-xs">
            <caption className="sr-only">Net and raw words per minute for each second</caption>
            <thead className="text-[var(--fg-faint)]">
              <tr>
                <th scope="col" className="py-1 pr-4 font-semibold">Second</th>
                <th scope="col" className="py-1 pr-4 font-semibold">Net</th>
                <th scope="col" className="py-1 pr-4 font-semibold">Raw</th>
                <th scope="col" className="py-1 font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody className="text-[var(--fg-muted)]">
              {points.map((p) => (
                <tr key={p.second}>
                  <td className="py-0.5 pr-4">{p.second}</td>
                  <td className="py-0.5 pr-4">{Math.round(p.net)}</td>
                  <td className="py-0.5 pr-4">{Math.round(p.raw)}</td>
                  <td className="py-0.5">{p.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <span className="sr-only">{`Maximum charted speed ${Math.round(maxY)} words per minute.`}</span>
    </figure>
  );
}
