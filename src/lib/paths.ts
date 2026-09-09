/**
 * The only sanctioned way to build a URL in this codebase.
 *
 * Next rewrites `<Link>`, `next/image` and `/_next/*` for `basePath`, but it
 * does NOT touch raw strings pointing into `public/`, and it does not touch
 * the string paths inside `manifest.ts`. Those have to be prefixed by hand,
 * and forgetting is invisible in `next dev` (where basePath is empty) while
 * being a 404 in production. Hence one choke point, and a post-build check
 * that greps the export for unprefixed paths.
 *
 * The subtle one: `new URL('/metrics/', 'https://host/signal-bloom/')` is
 * `https://host/metrics/` — a leading slash DISCARDS the base path. So a
 * relative canonical silently points at a page that does not exist. Every
 * canonical and every metadata URL goes through `abs()`.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** A path into `public/`, or an in-app href. */
export const asset = (path: `/${string}`): string => `${BASE_PATH}${path}`;

/** A fully-qualified URL, for metadata. Pass a trailing slash for pages. */
export const abs = (path: `/${string}`): string => `${ORIGIN}${BASE_PATH}${path}`;

/** Where the site actually lives, base path included. */
export const SITE_URL = `${ORIGIN}${BASE_PATH}`;

export const REPO_URL = "https://github.com/manojkumargogula/signal-bloom";

export const SITE = {
  name: "Signal Bloom",
  /** The origin plus base path -- where the site actually lives. */
  url: SITE_URL,
  /** The origin alone, for metadataBase. */
  origin: ORIGIN,
  author: "Manoj Kumar Gogula",
  github: REPO_URL,
  /**
   * One canonical description, reused verbatim in the page metadata, the
   * README and llms.txt. Answer engines reward a consistent self-definition,
   * and three drifting variants is what happens without a single source.
   */
  description:
    "Signal Bloom is a free, open-source browser typing game that measures how you actually type. " +
    "Climb a signal array while a flood rises under you \u2014 there is no clock, only the water \u2014 " +
    "then read your net WPM, raw WPM, accuracy, consistency, per-key heatmap and problem bigrams. " +
    "No account, no server.",
  tagline: "A typing game that measures how you actually type.",
} as const;
