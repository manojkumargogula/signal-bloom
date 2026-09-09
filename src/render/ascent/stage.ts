import type { Platform } from "@/engine/modes/ascent";
import { bandTheme } from "@/data/bands";

/**
 * The climb, drawn.
 *
 * Platforms are pooled DOM nodes written imperatively — the same discipline
 * the radar stage used, and for the same reasons: only `transform` and
 * `opacity` are written, nothing is ever read back, and discrete state moves
 * through `data-*` attributes touched only when they change. Reading a layout
 * property inside the loop would force a synchronous reflow, so this module
 * never does.
 *
 * Platform words are **real DOM text**. Canvas text discards the
 * accessibility tree, browser zoom, selection and find-in-page, and renders
 * softer at exactly the sizes that matter. In a game whose subject is reading
 * letterforms that trade is unavailable.
 *
 * ## The motion budget, which is the whole design
 *
 * Three rules, and everything readable about this screen follows from them:
 *
 * 1. **The camera anchors the active platform at a fixed height and its
 *    position only ever increases.** Nothing else moves it — no landing
 *    shake, no error shake, no tracking of the climber's arc. Every impact
 *    goes into the climber or the slab instead.
 * 2. **The camera is completely still while the player is typing.** It moves
 *    only during the anticipation-plus-airtime window, so scrolling is
 *    *interleaved* with reading rather than simultaneous.
 * 3. **Only the active platform animates.** The ones above it are static
 *    geometry. A moving object beside the word you are reading is the single
 *    most reliable way to make it unreadable.
 */

/** Where the active platform sits, as a fraction of viewport height. */
const ANCHOR = 0.46;

/** Vertical distance between platforms, as a fraction of viewport height. */
const SPACING = 0.15;

/**
 * The active slab's height and the climber's size, in pixels.
 *
 * Fixed rather than measured. The climber has to stand exactly on the slab's
 * top face, and the only way to know where that is without reading a layout
 * property inside the loop -- which would force a synchronous reflow every
 * frame -- is for the number to be a constant both the CSS and the renderer
 * agree on. So the slab's height is pinned in CSS and declared here, and
 * `feetOffset` is the one place the relationship lives.
 */
export const SLAB_HEIGHT = 52;
/** The ledge underfoot is shorter than a word slab, and the climber stands on IT. */
export const LEDGE_HEIGHT = 18;

export const CLIMBER_WIDTH = 58;
export const CLIMBER_HEIGHT = 76;

/** How far above a platform's centre the climber's feet rest. */
export function feetOffset(): number {
  return SLAB_HEIGHT / 2;
}

export interface Viewport {
  width: number;
  height: number;
}

interface PlatformNode {
  root: HTMLElement;
  slab: HTMLElement;
  word: HTMLElement;
  letters: HTMLElement[];
  boundIndex: number | null;
  boundWord: string;
  boundTyped: number;
  rank: number;
}

export class AscentStage {
  private pool: PlatformNode[] = [];
  /** The ledge the climber is standing on: the platform just cleared. */
  private ledge: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  /**
   * Where the climber's feet belong, relative to the anchor.
   *
   * One spacing BELOW the active platform, because the active platform is the
   * one being read. Standing the climber on it put a character on top of the
   * word it was supposed to be typing, which is the readability failure this
   * whole layout exists to avoid. The climber stands on the ledge it just
   * landed on and reads upward -- which is also the correct spatial story.
   */
  static feetY(viewportHeight: number): number {
    // LEDGE_HEIGHT, not SLAB_HEIGHT: the climber stands on the ledge, which
    // is shorter than a word slab. Using the wrong one of the two left it
    // floating 17px in the air -- the second time in this file that a
    // duplicated geometry number caused exactly that, hence both are
    // constants now and neither is written twice.
    return viewportHeight * ANCHOR + viewportHeight * SPACING - LEDGE_HEIGHT / 2;
  }

  private ensure(count: number): void {
    while (this.pool.length < count) {
      const root = document.createElement("div");
      root.className = "platform";
      root.setAttribute("aria-hidden", "true");

      const slab = document.createElement("div");
      slab.className = "platform-slab";

      const word = document.createElement("div");
      word.className = "platform-word";

      slab.append(word);
      root.append(slab);
      this.container.append(root);

      this.pool.push({
        root,
        slab,
        word,
        letters: [],
        boundIndex: null,
        boundWord: "",
        boundTyped: -1,
        rank: -1,
      });
    }
  }

  /**
   * Writes one frame.
   *
   * `cameraY` is the climber's height in platform spacings, already
   * interpolated by the caller. The whole scene is positioned from it as a
   * rigid block: a rigid translation is far more readable than differential
   * motion, which is why the parallax layers are separate and much slower.
   */
  render(
    platforms: readonly Platform[],
    viewport: Viewport,
    cameraY: number,
    band: number,
  ): void {
    this.ensure(platforms.length);
    const theme = bandTheme(band);
    const spacing = viewport.height * SPACING;

    // The ledge underfoot. Wordless: it is where the player IS, not where
    // they are going, so it carries no text to compete with the target.
    if (!this.ledge) {
      const ledge = document.createElement("div");
      ledge.className = "platform ledge";
      ledge.setAttribute("aria-hidden", "true");
      const slab = document.createElement("div");
      slab.className = "platform-slab";
      ledge.append(slab);
      this.container.append(ledge);
      this.ledge = ledge;
    }
    {
      const y = viewport.height * ANCHOR + spacing;
      const x = viewport.width * 0.5 + (platforms[0]?.offset ?? 0) * spacing * 2;
      this.ledge.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      this.ledge.style.opacity = "1";
    }

    for (let i = 0; i < this.pool.length; i++) {
      const node = this.pool[i];
      const platform = platforms[i];

      if (!platform) {
        if (node.boundIndex !== null) {
          node.root.style.opacity = "0";
          node.root.style.transform = "translate3d(-9999px,0,0)";
          node.boundIndex = null;
        }
        continue;
      }

      // The active platform is pinned to the anchor; the rest sit a fixed
      // spacing above it. The camera fraction slides the whole stack, so the
      // active word never moves while it is being read.
      const stepsAbove = platform.index - cameraY;
      const y = viewport.height * ANCHOR - stepsAbove * spacing;
      const x = viewport.width * 0.5 + platform.offset * spacing * 2;

      // The centring lives inside the transform string, not in a separate
      // CSS `translate` property. A standalone `translate` alongside an
      // inline `transform` was silently not applying, which left every
      // platform positioned by its top-left corner while the climber was
      // correctly centred -- a measured 38px disagreement between a climber
      // and the platform it was standing on. One transform, one place.
      node.root.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      node.root.style.opacity = "1";

      // Rank drives the salience ladder in CSS: 0 is active, 1 and 2 carry
      // their words at reduced size and weight, 3 is a textless slab.
      const rank = i;
      if (node.rank !== rank) {
        node.root.dataset.rank = String(rank);
        node.rank = rank;
      }
      if (node.boundIndex !== platform.index) {
        node.boundIndex = platform.index;
        node.root.dataset.pickup = platform.pickup ? "true" : "false";
      }

      // Letters are rebuilt only when the word changes, never per frame.
      if (node.boundWord !== platform.word) {
        node.boundWord = platform.word;
        node.boundTyped = -1;
        node.word.textContent = "";
        node.letters = [...platform.word].map((ch) => {
          const cell = document.createElement("span");
          cell.className = "platform-letter";
          cell.textContent = ch;
          node.word.append(cell);
          return cell;
        });
      }

      // And their state only when the typed prefix changes, which happens on
      // a keystroke rather than on a frame.
      if (node.boundTyped !== platform.typed) {
        node.boundTyped = platform.typed;
        for (let c = 0; c < node.letters.length; c++) {
          const state = c < platform.typed ? "done" : "pending";
          if (node.letters[c].dataset.state !== state) {
            node.letters[c].dataset.state = state;
          }
        }
      }

      void theme;
    }
  }

  /** Flashes a letter red. The only per-error motion the slab layer allows. */
  flashError(charIndex: number): void {
    const node = this.pool[0];
    const cell = node?.letters[charIndex];
    if (!cell) return;
    cell.dataset.state = "wrong";
    // The glyph never moves — only its cell colour changes. Any displacement
    // above a pixel destroys legibility at exactly the moment the player
    // needs to read the letter they just got wrong.
    window.setTimeout(() => {
      if (cell.dataset.state === "wrong") cell.dataset.state = "pending";
    }, 300);
  }

  clear(): void {
    if (this.ledge) this.ledge.style.opacity = "0";
    for (const node of this.pool) {
      node.root.style.opacity = "0";
      node.root.style.transform = "translate3d(-9999px,0,0)";
      node.boundIndex = null;
      node.boundWord = "";
    }
  }
}
