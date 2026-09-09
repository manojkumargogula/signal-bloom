"use client";

import { memo } from "react";
import type { HudSnapshot } from "@/engine/GameEngine";

/**
 * The readout strip.
 *
 * One subscription at this level with memoised children taking primitive
 * props, so a 10Hz publish diffs a handful of tiny components rather than the
 * whole tree. Nothing here animates: smooth motion is written straight to CSS
 * custom properties by the render loop and never routed through React.
 *
 * Laid out as instrument channels — a label above a value, in a fixed-width
 * mono face so nothing shifts as the digits change.
 */

const Channel = memo(function Channel({
  label,
  value,
  accent,
  size = "md",
}: {
  label: string;
  value: string;
  accent?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="label">{label}</span>
      <span
        className={[
          "num font-semibold leading-none",
          size === "lg" ? "text-[1.6rem]" : "text-[1.15rem]",
          accent ? "text-[var(--amber)]" : "text-[var(--fg)]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
});

const Shields = memo(function Shields({ shields, max }: { shields: number; max: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Shields</span>
      <div
        className="flex items-center gap-[3px] pt-[3px]"
        role="img"
        aria-label={`${shields} of ${max} shields remaining`}
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={
              i < shields
                ? "h-3.5 w-2 bg-[var(--amber)]"
                : "h-3.5 w-2 border border-[var(--line-strong)]"
            }
          />
        ))}
      </div>
    </div>
  );
});

/**
 * How close the water is.
 *
 * Rendered as discrete segments rather than a smooth bar. A continuous bar
 * would be one more thing moving on screen, and a player under pressure reads
 * "two segments left" faster than they read a bar's length -- which is also
 * what makes this legible with reduced motion on.
 */
const Water = memo(function Water({ gap }: { gap: number }) {
  const segments = 8;
  const filled = Math.max(0, Math.min(segments, Math.round(gap * segments)));
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Clearance</span>
      <div
        className="flex items-center gap-[3px] pt-[3px]"
        role="img"
        aria-label={`${filled} of ${segments} clearance above the water`}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={
              i < filled
                ? filled <= 2
                  ? "h-3.5 w-1.5 bg-[var(--fault)]"
                  : "h-3.5 w-1.5 bg-[var(--amber)]"
                : "h-3.5 w-1.5 border border-[var(--line-strong)]"
            }
          />
        ))}
      </div>
    </div>
  );
});

/**
 * The readout.
 *
 * No clock, because there is no clock: the run ends when the water reaches
 * you, so the thing in that position is `Water` -- how much room is left. It
 * is the only readout the player has to watch.
 */
export const Hud = memo(function Hud({ snapshot }: { snapshot: HudSnapshot }) {
  return (
    <div className="flex w-full items-start justify-between gap-8">
      <div className="flex items-start gap-8">
        <Channel label="Height" value={String(snapshot.height)} size="lg" accent />
        <Channel label="Score" value={snapshot.score.toLocaleString()} size="lg" />
        <Channel label="Combo" value={snapshot.combo > 0 ? `${snapshot.combo}×` : "—"} />
        <Channel label="Band" value={snapshot.bandName} />
      </div>

      <div className="flex items-start gap-8">
        <Channel label="WPM" value={String(Math.round(snapshot.wpm))} size="lg" accent />
        <Channel label="Accuracy" value={`${snapshot.accuracy.toFixed(1)}%`} />
        <Shields shields={snapshot.shields} max={snapshot.maxShields} />
        <Water gap={snapshot.gap} />
      </div>
    </div>
  );
});
