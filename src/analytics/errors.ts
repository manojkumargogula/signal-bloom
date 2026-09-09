import { areAdjacent, codeForChar } from "./layouts";
import type { ErrorEventCounts, KeystrokeEvent } from "./types";

/**
 * Error classification.
 *
 * Classified from the KEYSTROKE STREAM rather than by diffing the final text
 * against the target. That choice matters: diffing only sees errors the player
 * left in place, and most errors get corrected within a keystroke or two. A
 * stream classifier sees the mistake that was made and fixed, which is the
 * majority of them and the ones worth coaching.
 *
 * `alignOsa` below implements the final-text alignment anyway — not as the
 * primary path, but as an independent second opinion the tests cross-check
 * against, so a bug in one is unlikely to hide in both.
 */

export type ErrorKind = "substitution" | "omission" | "insertion" | "transposition";

export interface ClassifiedError {
  seq: number;
  wordIndex: number;
  charIndex: number;
  expected: string;
  actual: string;
  kind: ErrorKind;
  /** The wrong key sits next to the right one — a reach slip, not a mix-up. */
  adjacentKey: boolean;
}

const isSpace = (ch: string): boolean => ch === " " || ch === "\t" || ch === "\n";

export function classifyErrors(
  log: readonly KeystrokeEvent[],
  targets: readonly string[],
): ClassifiedError[] {
  const firstPresses = log.filter((k) => k.kind === "insert" && k.firstPress);

  // Index first presses by word so lookahead stays inside the current target.
  const byWord = new Map<number, KeystrokeEvent[]>();
  for (const k of firstPresses) {
    const list = byWord.get(k.wordIndex);
    if (list) list.push(k);
    else byWord.set(k.wordIndex, [k]);
  }

  const out: ClassifiedError[] = [];
  const consumed = new Set<number>();

  for (const [wordIndex, presses] of byWord) {
    const target = targets[wordIndex] ?? "";

    for (let p = 0; p < presses.length; p++) {
      const ev = presses[p];
      if (ev.correct || consumed.has(ev.seq)) continue;

      const i = ev.charIndex;
      const expected = ev.expected ?? target[i] ?? "";
      const actual = ev.actual;
      const nextExpected = target[i + 1] ?? "";
      const prevExpected = i > 0 ? target[i - 1] : "";
      const next = presses[p + 1];

      let kind: ErrorKind;

      if (actual !== "" && actual === nextExpected && next && next.actual === expected) {
        // Rule 1: the next two characters arrived in swapped order. One event,
        // two wrong keystrokes — reported separately so the numbers reconcile.
        kind = "transposition";
        consumed.add(next.seq);
      } else if (actual !== "" && actual === prevExpected) {
        // Rule 2: the previous key repeated — a doubled keypress.
        kind = "insertion";
      } else if (
        actual !== "" &&
        actual === nextExpected &&
        (next === undefined || !next.correct)
      ) {
        // Rule 3: jumped ahead by one, so the expected character was skipped.
        //
        // The `!next.correct` guard is what separates a real skip from a plain
        // substitution, and it is subtle enough to be worth spelling out.
        // Typing "eed" for "red" and "acd" for "abcd" both begin with a
        // keystroke that matches the NEXT expected character. The difference
        // is what happens afterwards: a genuine skip shifts every following
        // character, so the next press is also wrong, whereas a substitution
        // is self-contained and the stream resumes correctly. Without this
        // guard every substitution-by-the-next-letter is misreported as an
        // omission.
        kind = "omission";
      } else if (isSpace(actual) && !isSpace(expected)) {
        // Rule 4: submitted the word before finishing it.
        kind = "omission";
      } else if (isSpace(expected) && !isSpace(actual)) {
        // Rule 5: kept typing past the end of the word.
        kind = "insertion";
      } else {
        kind = "substitution";
      }

      out.push({
        seq: ev.seq,
        wordIndex,
        charIndex: i,
        expected,
        actual,
        kind,
        adjacentKey:
          kind === "substitution" &&
          areAdjacent(ev.code ?? codeForChar(actual), codeForChar(expected)),
      });
    }
  }

  out.sort((a, b) => a.seq - b.seq);
  return out;
}

export function countErrorEvents(errors: readonly ClassifiedError[]): ErrorEventCounts {
  const counts: ErrorEventCounts = {
    substitution: 0,
    omission: 0,
    insertion: 0,
    transposition: 0,
  };
  for (const e of errors) counts[e.kind]++;
  return counts;
}

/**
 * Optimal String Alignment distance with an operation backtrace.
 *
 * "Restricted" Damerau-Levenshtein: adjacent transpositions cost 1, and no
 * substring is edited more than once. Transposition is preferred over two
 * substitutions wherever both explain the same difference, which is what makes
 * "hte" read as one swap rather than two wrong letters.
 */
export function alignOsa(expected: string, actual: string): ErrorCounts {
  const m = expected.length;
  const n = actual.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = expected[i - 1] === actual[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // omission: an expected char was not produced
        d[i][j - 1] + 1, // insertion: an extra char was produced
        d[i - 1][j - 1] + cost, // match or substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        expected[i - 1] === actual[j - 2] &&
        expected[i - 2] === actual[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  const counts: ErrorCounts = {
    substitution: 0,
    omission: 0,
    insertion: 0,
    transposition: 0,
    distance: d[m][n],
  };

  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (
      i > 1 &&
      j > 1 &&
      expected[i - 1] === actual[j - 2] &&
      expected[i - 2] === actual[j - 1] &&
      d[i][j] === d[i - 2][j - 2] + 1
    ) {
      counts.transposition++;
      i -= 2;
      j -= 2;
      continue;
    }
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] && expected[i - 1] === actual[j - 1]) {
      i--;
      j--;
      continue;
    }
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      counts.substitution++;
      i--;
      j--;
      continue;
    }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      counts.omission++;
      i--;
      continue;
    }
    counts.insertion++;
    j--;
  }

  return counts;
}

export interface ErrorCounts extends ErrorEventCounts {
  distance: number;
}
