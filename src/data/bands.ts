/**
 * Band themes.
 *
 * Every twelve platforms the climb enters a new band and the world changes
 * colour. This is where all the colour in the product lives: the interface
 * chrome stays amber, and the world provides the variety.
 *
 * The decision that makes colour safe: a platform word is NEVER set against
 * the sky. Every platform is a solid slab, and the word sits on the slab — so
 * its contrast is against `slab`, a colour defined here and identical in
 * structure across every theme, rather than against whatever a generated sky
 * happens to be doing behind it. `scripts/check-contrast.mjs` asserts the
 * word-on-slab and pip-on-slab pairs for all of them, so a new theme cannot
 * ship unreadable.
 */

export interface BandTheme {
  id: string;
  /** Shown to the player when the band changes. */
  name: string;
  /** The generated sky, as a path under public/. */
  sky: string;
  /** Fallback if the sky image has not loaded, and what reduced motion uses. */
  skyFallback: [string, string];
  /** Parallax ridge silhouettes, far to near. */
  ridges: [string, string];
  /** The platform slab. Every word is read against this. */
  slab: string;
  /** The slab's lit edge, and the frame around the active platform. */
  slabEdge: string;
  /** The word on the slab. */
  word: string;
  /** Letters already typed. */
  wordDone: string;
  /**
   * The flood, and the foam on its crest.
   *
   * Both are checked against the BOTTOM stop of `skyFallback`, which is the
   * colour the rising water actually meets. That check is not decoration:
   * every one of these five pairs failed it when it was first written. The
   * dawn band's foam was the app's amber accent on an amber sky, so the crest
   * line was not visible at all, and the four dark bands had water within
   * 1.07:1 of their own skies -- a mass of water you cannot see is not water
   * rising, it is a filter. So the water is LIGHTER than the sky it rises
   * against, which is also what a body of water reflecting a sky does at
   * night, and the foam is lighter again.
   */
  water: string;
  waterFoam: string;
}

/**
 * Five themes, cycling. Ordered so band 1 sits closest to the app's own amber
 * — a player's first contact with the mode should still look like the product
 * they opened.
 */
export const BANDS: BandTheme[] = [
  {
    id: "dawn",
    name: "Dawn valley",
    sky: "/sky/band-1.webp",
    skyFallback: ["#f6c46a", "#c96a3f"],
    ridges: ["#8a5a3c", "#4a2f22"],
    slab: "#1a1208",
    slabEdge: "#ffb627",
    word: "#f4ead8",
    wordDone: "#ffb627",
    // A dawn lake, not mud. The first pass gave this band a warm brown water
    // under a warm amber sky, which read as haze over the valley floor rather
    // than as a surface -- it passed a luminance check and still looked wrong.
    // Cooling it is what makes it a liquid.
    water: "#2a4a4e",
    waterFoam: "#fff2d0",
  },
  {
    id: "pine",
    name: "Pine dusk",
    sky: "/sky/band-2.webp",
    skyFallback: ["#2e4a6b", "#12242f"],
    ridges: ["#1b4a42", "#0d2621"],
    slab: "#0a1614",
    slabEdge: "#5fd6b4",
    word: "#e6f2ee",
    wordDone: "#5fd6b4",
    water: "#17635a",
    waterFoam: "#8fe3c8",
  },
  {
    id: "storm",
    name: "Storm front",
    sky: "/sky/band-3.webp",
    skyFallback: ["#4a4a63", "#1a1a2a"],
    ridges: ["#3c3c56", "#1e1e2e"],
    slab: "#111018",
    slabEdge: "#a99cf5",
    word: "#eeecf7",
    wordDone: "#a99cf5",
    water: "#4c5089",
    waterFoam: "#9a93e0",
  },
  {
    id: "night",
    name: "Night array",
    sky: "/sky/band-4.webp",
    skyFallback: ["#141b38", "#05070f"],
    ridges: ["#1a2244", "#0a0e1d"],
    slab: "#080a14",
    slabEdge: "#7fb3ff",
    word: "#e8eef8",
    wordDone: "#7fb3ff",
    water: "#204a8c",
    waterFoam: "#7ba6e8",
  },
  {
    id: "aurora",
    name: "Aurora",
    sky: "/sky/band-5.webp",
    skyFallback: ["#0d2a24", "#03080a"],
    ridges: ["#10362c", "#061612"],
    slab: "#050f0c",
    slabEdge: "#79f0c0",
    // The typed prefix pulls further from the pending letters than the band
    // accent did. At #79f0c0 for both, the two states were only 13.7 apart in
    // OKLab -- a mint on a green-white, distinguishable if you looked for it
    // and not while reading at speed. The frame keeps the accent.
    word: "#f2faf6",
    wordDone: "#3fe8a8",
    water: "#0f5240",
    waterFoam: "#7ff0c4",
  },
];

/** The theme for a band number, cycling once past the last. */
export function bandTheme(band: number): BandTheme {
  const index = Math.max(0, band - 1) % BANDS.length;
  return BANDS[index];
}

/** Platforms per band. Also the interval at which the world changes. */
export const PLATFORMS_PER_BAND = 12;
