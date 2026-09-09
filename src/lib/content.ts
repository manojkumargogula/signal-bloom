/**
 * The content registry.
 *
 * One source for the sitemap, the navigation and llms.txt, so a new page
 * cannot be added to one and forgotten in the other two.
 */
export interface ContentRoute {
  path: `/${string}`;
  title: string;
  /**
   * A standalone extractable fact, not "learn more about X". This is the only
   * part of a link description that has any value to an answer engine.
   */
  summary: string;
  /** The source file, so the sitemap can use its real git commit date. */
  source: string;
}

export const CONTENT_ROUTES: ContentRoute[] = [
  {
    path: "/",
    title: "Signal Bloom — a typing game with real typing analysis",
    summary:
      "The game itself: an untimed vertical typing platformer where a rising flood is the only thing that can end a run.",
    source: "src/app/page.tsx",
  },
  {
    path: "/metrics/",
    title: "Typing metrics glossary",
    summary:
      "What WPM, raw WPM, accuracy and consistency each mean, with the exact formula used for every one.",
    source: "src/app/metrics/page.tsx",
  },
  {
    path: "/how-it-works/",
    title: "How Signal Bloom works",
    summary:
      "Wave structure, relics, word selection, scoring, and where your typing history is stored.",
    source: "src/app/how-it-works/page.tsx",
  },
  {
    path: "/faq/",
    title: "Frequently asked questions",
    summary:
      "Cost, accounts, data storage, mobile support, keyboard layouts, offline play and licensing.",
    source: "src/app/faq/page.tsx",
  },
];
