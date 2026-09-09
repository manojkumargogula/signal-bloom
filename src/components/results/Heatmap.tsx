"use client";

import { useMemo } from "react";
import type { KeyStat } from "@/analytics/types";
import { QWERTY } from "@/analytics/layouts";

/**
 * Per-key accuracy, laid out as a keyboard.
 *
 * A sequential ramp on ONE hue: magnitude is the job, so lightness carries it
 * and no second hue is introduced. Every cell also carries its numeric label
 * in its aria-label, and the whole thing is a real table for assistive
 * technology -- colour is never the only channel.
 *
 * Keys with too few attempts to judge stay neutral rather than being painted
 * an alarming red on the strength of two presses.
 */

const MIN_ATTEMPTS = 3;

interface HeatmapProps {
  byCode: Record<string, KeyStat>;
}

function cellStyle(stat: KeyStat | undefined): { background: string; colour: string } {
  if (!stat || stat.attempts < MIN_ATTEMPTS) {
    return { background: "var(--bg-inset)", colour: "var(--fg-faint)" };
  }
  const errorRate = 1 - stat.accuracy;
  if (errorRate <= 0.001) {
    return { background: "color-mix(in oklab, var(--series-net) 22%, var(--bg-panel))", colour: "var(--fg)" };
  }
  // One hue, stepped by magnitude. Clamped at 40% error so a single
  // catastrophic key does not flatten the rest of the ramp.
  const t = Math.min(1, errorRate / 0.4);
  const mix = 18 + t * 62;
  return {
    background: `color-mix(in oklab, var(--fault) ${mix.toFixed(0)}%, var(--bg-panel))`,
    colour: t > 0.55 ? "var(--bg)" : "var(--fg)",
  };
}

export function Heatmap({ byCode }: HeatmapProps) {
  const rows = useMemo(() => QWERTY.rows, []);
  const touched = Object.values(byCode).filter((s) => s.attempts >= MIN_ATTEMPTS).length;

  if (touched === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Not enough keystrokes yet. The heatmap needs at least three presses of a key before it
        will judge it.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--fg)]">Accuracy by key</h3>
        <span className="flex items-center gap-3 text-xs text-[var(--fg-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: "color-mix(in oklab, var(--series-net) 22%, var(--bg-panel))" }} />
            clean
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: "color-mix(in oklab, var(--fault) 70%, var(--bg-panel))" }} />
            missed often
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[var(--bg-inset)]" />
            too few presses
          </span>
        </span>
      </figcaption>

      <div className="overflow-x-auto">
        <div className="type-surface flex min-w-[34rem] flex-col gap-1">
          {rows.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map((key) => {
                const stat = byCode[key.code];
                const style = cellStyle(stat);
                const judged = stat && stat.attempts >= MIN_ATTEMPTS;

                return (
                  <div
                    key={key.code}
                    role="img"
                    aria-label={
                      judged
                        ? `${key.label}: ${(stat.accuracy * 100).toFixed(0)} percent accurate over ${stat.attempts} presses${
                            stat.meanLatency ? `, ${Math.round(stat.meanLatency)} milliseconds average` : ""
                          }`
                        : `${key.label}: not enough presses to judge`
                    }
                    title={
                      judged
                        ? `${key.label} · ${(stat.accuracy * 100).toFixed(0)}% over ${stat.attempts}`
                        : `${key.label} · —`
                    }
                    className="flex h-9 items-center justify-center rounded text-[0.62rem] font-medium"
                    style={{
                      flex: `${key.width ?? 1} 1 0`,
                      background: style.background,
                      color: style.colour,
                    }}
                  >
                    {key.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
