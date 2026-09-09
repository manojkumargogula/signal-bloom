"use client";

import { memo } from "react";

/**
 * The typing surface for Sprint and Zen.
 *
 * Real DOM text, one span per character. That is a deliberate constraint
 * rather than convenience: canvas text discards the accessibility tree,
 * browser zoom, text selection and find-in-page, and at fractional device
 * pixel offsets it renders softer than the browser's own hinted glyphs. In a
 * game whose entire subject is reading letterforms, that trade is unavailable.
 */

export type CharState = "pending" | "correct" | "wrong" | "extra";

interface WordProps {
  target: string;
  typed: readonly string[];
  isActive: boolean;
  caretAt: number;
}

const Word = memo(function Word({ target, typed, isActive, caretAt }: WordProps) {
  const chars = [...target];
  const overflow = typed.length > chars.length ? typed.slice(chars.length) : [];

  return (
    <span className="inline-block whitespace-pre">
      {chars.map((ch, i) => {
        const actual = typed[i];
        let state: CharState = "pending";
        if (actual !== undefined) state = actual === ch ? "correct" : "wrong";

        const showCaret = isActive && i === caretAt;
        return (
          <span
            key={i}
            data-state={state}
            className={[
              "relative",
              state === "pending" && "text-[var(--type-pending)]",
              state === "correct" && "text-[var(--type-done)]",
              // A wrong space has no glyph to colour, so it gets a visible
              // background instead -- otherwise the error is invisible.
              state === "wrong" &&
                (ch === " "
                  ? "bg-[var(--type-error)]/35 text-[var(--type-error)]"
                  : "text-[var(--type-error)] underline decoration-[var(--type-error)] decoration-2 underline-offset-4"),
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {showCaret && <Caret />}
            {ch}
          </span>
        );
      })}

      {/* Characters typed past the end of the word. Shown so the player can
          see what they actually produced rather than silently dropping it. */}
      {overflow.map((ch, i) => (
        <span key={`x${i}`} className="text-[var(--type-error)]/70 line-through">
          {ch === " " ? "·" : ch}
        </span>
      ))}

      {isActive && caretAt >= chars.length + overflow.length && (
        <span className="relative">
          <Caret />
        </span>
      )}
    </span>
  );
});

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="caret absolute -left-[1px] top-[0.06em] h-[1.15em] w-[2px] rounded-full bg-[var(--type-caret)]"
    />
  );
}

interface TypingSurfaceProps {
  targets: readonly string[];
  wordIndex: number;
  charIndex: number;
  typedWords: readonly (readonly string[])[];
  /** How many words to show at once. */
  window?: number;
}

export function TypingSurface({
  targets,
  wordIndex,
  charIndex,
  typedWords,
  window: windowSize = 36,
}: TypingSurfaceProps) {
  // Show a window around the cursor rather than the whole corpus. A 200-word
  // run would otherwise mount well over a thousand spans, and the cursor
  // stays on the first of three lines so the text never scrolls under the
  // player's eye mid-word.
  const rowStart = Math.max(0, Math.floor((wordIndex - 2) / 8) * 8);
  const visible = targets.slice(rowStart, rowStart + windowSize);

  return (
    <div
      // Three lines, clipped. A fixed height means the block never grows and
      // shifts the layout as words wrap.
      className="type-surface mx-auto h-[6.3em] max-w-4xl select-none overflow-hidden text-[clamp(1.1rem,2.1vw,1.6rem)] leading-[2.1]"
      aria-hidden="true"
    >
      {visible.map((target, i) => {
        const index = rowStart + i;
        return (
          <Word
            key={index}
            target={target}
            typed={typedWords[index] ?? EMPTY}
            isActive={index === wordIndex}
            caretAt={charIndex}
          />
        );
      })}
    </div>
  );
}

const EMPTY: readonly string[] = [];
