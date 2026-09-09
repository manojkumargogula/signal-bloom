import type { Corpus } from "../types";

/**
 * Number drills.
 *
 * The top row is the weakest part of almost everyone's keyboard, and it never
 * appears in a prose corpus. Kept as separate targets so the heatmap can show
 * digit accuracy independently of letters.
 */
const corpus: Corpus = {
  id: "en-numbers",
  label: "Numbers",
  kind: "numbers",
  language: "en",
  wpmUnit: "chars5",
  source: { name: "Generated numeric drills", license: "CC0-1.0" },
  words: [
    "10", "27", "38", "49", "56", "63", "72", "85", "94", "108",
    "125", "144", "169", "196", "225", "256", "289", "324", "361", "400",
    "512", "640", "768", "800", "960", "1024", "1440", "1920", "2048", "4096",
    "3.14", "2.71", "1.41", "0.99", "12.5", "33.3", "66.6", "99.9",
    "1970", "1984", "1999", "2001", "2026",
    "50%", "75%", "100%", "0.1%", "8080", "3000", "443", "127.0.0.1",
  ],
};

export default corpus;
