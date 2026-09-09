/**
 * Corpus data model.
 *
 * Word lists are the most likely thing a first-time contributor will add, so
 * the shape is deliberately plain: one file, one default export, no
 * registration step. `src/data/index.ts` globs the directory.
 *
 * `license` is mandatory and CI rejects a list without it. A scraped word list
 * from a paid dictionary is the easiest way for an MIT repo to quietly ingest
 * someone else's copyright, and it arrives looking like a trivial PR.
 */

export type CorpusKind = "words" | "quotes" | "code" | "numbers";

/**
 * Characters per standard word.
 *
 * The "5 characters = 1 word" convention is a Latin-script assumption and is
 * meaningless for CJK. Carrying it as data now means a Japanese word list can
 * be added later without invalidating every stored run.
 */
export type WpmUnit = "chars5" | "chars1";

export interface CorpusSource {
  name: string;
  url?: string;
  /** SPDX identifier. Must be in the allowlist checked by CI. */
  license: string;
}

export interface Corpus {
  id: string;
  label: string;
  kind: CorpusKind;
  /** BCP-47. */
  language: string;
  wpmUnit: WpmUnit;
  source: CorpusSource;
  /**
   * Difficulty bands, so a wave director can escalate without recomputing
   * anything at runtime. Words are pre-sorted into these at authoring time.
   */
  words: string[];
  /** Present for quote corpora. */
  quotes?: Quote[];
  /** Present for code corpora. */
  snippets?: CodeSnippet[];
}

export interface Quote {
  text: string;
  author: string;
  source?: string;
}

export interface CodeSnippet {
  id: string;
  language: string;
  /** Lines, already stripped of trailing whitespace. */
  lines: string[];
}

export const CHARS_PER_WORD: Record<WpmUnit, number> = {
  chars5: 5,
  chars1: 1,
};

/** Difficulty score in 0..1, from length and character variety. */
export function difficultyOf(word: string): number {
  const len = Math.min(word.length, 14) / 14;
  const unique = new Set(word).size / Math.max(word.length, 1);
  const special = [...word].filter((c) => !/[a-z]/.test(c)).length / Math.max(word.length, 1);
  return Math.min(1, 0.55 * len + 0.2 * (1 - unique) + 0.25 * special);
}
