"use client";

import { RELIC_BY_ID } from "@/engine/relics/defs";
import type { Rarity } from "@/engine/relics/types";
import { Button, Kbd } from "./ui/Button";
import { useEffect } from "react";

const RARITY_STYLE: Record<Rarity, { border: string; text: string; label: string }> = {
  common: { border: "border-[var(--line-strong)]", text: "text-[var(--fg-muted)]", label: "Common" },
  rare: { border: "border-[var(--plasma)]", text: "text-[var(--plasma)]", label: "Rare" },
  epic: { border: "border-[var(--flare)]", text: "text-[var(--flare)]", label: "Epic" },
};

interface RelicDraftProps {
  offers: readonly string[];
  wave: number;
  onPick: (id: string) => void;
  onSkip: () => void;
}

/**
 * The between-wave draft.
 *
 * Keyboard-first, like everything else: 1, 2 and 3 pick, so a player never has
 * to move their hands to the mouse mid-run. That matters more here than
 * anywhere else in the game, because the draft interrupts a typing flow.
 */
export function RelicDraft({ offers, wave, onPick, onSkip }: RelicDraftProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < offers.length) {
        event.preventDefault();
        onPick(offers[index]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [offers, onPick, onSkip]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Wave ${wave} salvage`}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[var(--bg)]/92 p-6"
    >
      <div className="text-center">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--ion)]">
          Wave {wave - 1} cleared
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
          Salvage one instrument
        </h2>
      </div>

      <ul className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {offers.map((id, i) => {
          const relic = RELIC_BY_ID[id];
          if (!relic) return null;
          const style = RARITY_STYLE[relic.rarity];

          return (
            <li key={id}>
              <button
                onClick={() => onPick(id)}
                className={[
                  "group flex h-full w-full flex-col gap-2 rounded-lg border bg-[var(--bg-panel)] p-4 text-left",
                  "transition-colors duration-150 hover:border-[var(--ion)]",
                  style.border,
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[0.6rem] font-semibold uppercase tracking-[0.18em] ${style.text}`}
                  >
                    {style.label}
                  </span>
                  <Kbd>{i + 1}</Kbd>
                </div>
                <h3 className="text-base font-semibold text-[var(--fg)]">{relic.name}</h3>
                {/* The blurb states exactly what changes. A relic whose effect
                    the player has to guess at is a coin flip, not a choice. */}
                <p className="text-sm leading-snug text-[var(--fg-muted)]">{relic.blurb}</p>
              </button>
            </li>
          );
        })}
      </ul>

      <Button variant="quiet" onClick={onSkip}>
        Skip <Kbd>Esc</Kbd>
      </Button>
    </div>
  );
}
