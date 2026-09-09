"use client";

import type { KeyStat } from "@/analytics/types";
import { FINGER_LABEL, FINGER_ORDER } from "@/analytics/layouts";

/**
 * Accuracy by finger.
 *
 * Bars anchored to the baseline with a 4px rounded data-end, direct-labelled
 * so no legend is needed, and a 2px gap between adjacent fills. Untouched
 * fingers are shown as empty rather than omitted: the absence is itself
 * informative, since it usually means the player is not using that finger.
 */
export function FingerChart({ byFinger }: { byFinger: Record<string, KeyStat> }) {
  const max = Math.max(1, ...FINGER_ORDER.map((f) => byFinger[f]?.attempts ?? 0));
  const anyData = FINGER_ORDER.some((f) => (byFinger[f]?.attempts ?? 0) > 0);

  if (!anyData) return null;

  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--fg)]">Load and accuracy by finger</h3>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Bar length is how much work the finger did. The number is its accuracy.
        </p>
      </figcaption>

      <ul className="flex flex-col gap-[3px]">
        {FINGER_ORDER.map((finger) => {
          const stat = byFinger[finger];
          const attempts = stat?.attempts ?? 0;
          const share = attempts / max;
          const weak = attempts >= 8 && stat && stat.accuracy < 0.92;

          return (
            <li key={finger} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-right text-[var(--fg-muted)]">
                {FINGER_LABEL[finger]}
              </span>
              <span className="relative h-4 flex-1 overflow-hidden rounded-[4px] bg-[var(--bg-inset)]">
                {attempts > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-[4px]"
                    style={{
                      width: `${Math.max(share * 100, 1.5)}%`,
                      background: weak ? "var(--fault)" : "var(--series-net)",
                      opacity: weak ? 0.85 : 1,
                    }}
                  />
                )}
              </span>
              <span className="num w-20 shrink-0 text-[var(--fg-muted)]">
                {attempts === 0 ? "unused" : `${(stat.accuracy * 100).toFixed(0)}% / ${attempts}`}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
