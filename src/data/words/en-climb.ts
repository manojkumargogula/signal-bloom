import type { Corpus } from "../types";
import enCommon from "./en-common";
import enAdvanced from "./en-advanced";

/**
 * The climb's pool: the common list plus the advanced one.
 *
 * Composed rather than authored, because both halves are needed and neither
 * is sufficient. Word length steps up with each band and caps at eight, and
 * the common list holds only 64 words of six to eight letters -- so a long
 * climb would circle the same few dozen words from band four onward, which
 * reads as the game running out of content. The advanced list contributes 27
 * more in that range along with everything longer, which the climb ignores.
 *
 * The other direction matters too: the advanced list has almost nothing under
 * five letters, and the opening bands are where a new player learns what the
 * screen means. Neither list alone covers the curve.
 *
 * Both halves are CC0, and the composed corpus records where its words came
 * from rather than inventing a new provenance -- the licence gate in
 * `corpus.test.ts` reads this field.
 */
const corpus: Corpus = {
  id: "en-climb",
  label: "English · the climb",
  kind: "words",
  language: "en",
  wpmUnit: "chars5",
  source: {
    name: `${enCommon.source.name}; ${enAdvanced.source.name}`,
    license: enCommon.source.license,
  },
  words: [...enCommon.words, ...enAdvanced.words],
};

export default corpus;
