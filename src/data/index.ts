import type { Corpus } from "./types";
import enCommon from "./words/en-common";
import enClimb from "./words/en-climb";
import enAdvanced from "./words/en-advanced";
import enCode from "./words/en-code";
import enNumbers from "./words/en-numbers";
import enQuotes from "./quotes";

/**
 * The corpus registry.
 *
 * Adding a corpus is two lines here plus one new file. The import list is
 * explicit rather than a glob so the bundler can tree-shake and so a
 * typo produces a compile error instead of a silently missing list.
 */
export const CORPORA: Corpus[] = [enClimb, enCommon, enAdvanced, enCode, enNumbers, enQuotes];

/** What the climb draws from. */
export const DEFAULT_CORPUS_ID = "en-climb";

export function getCorpus(id: string): Corpus {
  return CORPORA.find((c) => c.id === id) ?? CORPORA[0];
}

export type { Corpus } from "./types";
