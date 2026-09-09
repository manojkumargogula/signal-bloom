import { describe, expect, it } from "vitest";
import { CORPORA, getCorpus, DEFAULT_CORPUS_ID } from "./index";
import { difficultyOf } from "./types";

/**
 * These run over every registered corpus, so a contributed word list is
 * validated automatically rather than by eye during review. That is what makes
 * it safe to merge a word-list PR from a stranger.
 */
const ALLOWED_LICENSES = new Set([
  "CC0-1.0", "MIT", "CC-BY-4.0", "CC-BY-SA-4.0", "Unlicense", "Apache-2.0",
]);

describe("corpus registry", () => {
  it("has a resolvable default", () => {
    expect(getCorpus(DEFAULT_CORPUS_ID).id).toBe(DEFAULT_CORPUS_ID);
  });

  it("falls back rather than throwing on an unknown id", () => {
    expect(getCorpus("does-not-exist").id).toBe(CORPORA[0].id);
  });

  it("has unique ids", () => {
    const ids = CORPORA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(CORPORA.map((c) => [c.id, c] as const))("corpus %s", (_id, corpus) => {
  it("declares a source and an allowed licence", () => {
    // The gate that stops a scraped proprietary dictionary arriving as a
    // one-line PR.
    expect(corpus.source.name.length).toBeGreaterThan(0);
    expect(ALLOWED_LICENSES.has(corpus.source.license)).toBe(true);
  });

  it("has content", () => {
    const size = corpus.words.length + (corpus.quotes?.length ?? 0);
    expect(size).toBeGreaterThan(0);
  });

  it("has no duplicate words", () => {
    expect(new Set(corpus.words).size).toBe(corpus.words.length);
  });

  it("is NFC-normalised", () => {
    // Un-normalised text breaks grapheme-wise cursor advance: a combining
    // accent would be typed as one keystroke but counted as two characters.
    for (const w of corpus.words) expect(w).toBe(w.normalize("NFC"));
    for (const q of corpus.quotes ?? []) expect(q.text).toBe(q.text.normalize("NFC"));
  });

  it("has no leading or trailing whitespace, and no empty entries", () => {
    for (const w of corpus.words) {
      expect(w).toBe(w.trim());
      expect(w.length).toBeGreaterThan(0);
    }
  });

  it("keeps words within a typeable length", () => {
    for (const w of corpus.words) expect(w.length).toBeLessThanOrEqual(24);
  });

  it("attributes every quote", () => {
    for (const q of corpus.quotes ?? []) {
      expect(q.author.length).toBeGreaterThan(0);
      expect(q.text.length).toBeGreaterThan(10);
    }
  });
});

describe("difficultyOf", () => {
  it("stays within 0..1", () => {
    for (const corpus of CORPORA) {
      for (const w of corpus.words) {
        const d = difficultyOf(w);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ranks a long unusual word above a short common one", () => {
    expect(difficultyOf("infrastructure")).toBeGreaterThan(difficultyOf("the"));
  });
});
