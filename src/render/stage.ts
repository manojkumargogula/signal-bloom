import type { Transmission } from "@/engine/types";

/**
 * The transmission field.
 *
 * Entities are pooled DOM nodes written imperatively — two style writes each
 * per frame, and nothing is ever read back. Reading a layout property inside
 * the loop (offsetWidth, getBoundingClientRect) would force a synchronous
 * reflow and is the fastest way to destroy a frame budget, so this module
 * never does it.
 *
 * Depth is NOT conveyed with a CSS scale. A 3D-transformed element is
 * promoted to a compositor layer and rasterised once at the scale it had when
 * promoted; combined with `will-change: transform`, which the transforms need
 * for performance, scaling the element stretches that bitmap and the text goes
 * blurry. That would defeat the entire reason for choosing DOM over canvas.
 *
 * Instead the perspective is computed in JS, only translate3d and opacity are
 * written, and apparent distance comes from eight quantised font-size rungs
 * applied as a data attribute. A rung change re-rasterises roughly eight
 * times over an entity's life rather than sixty times a second.
 */

const RUNGS = 8;

/**
 * Where the perimeter sits, as a fraction of the half-viewport.
 *
 * Contacts breach here rather than at a single point: converging on one pixel
 * would pile every word in the run on top of the last, and the player could
 * not read any of them.
 */
const PERIMETER = 0.3;

/**
 * How far out the rim is.
 *
 * Well short of 1: a contact is positioned by its centre, so a long word at
 * the rim would run off the edge of the board and become unreadable while
 * still being lethal.
 */
const RIM = 0.8;

/**
 * Projects a contact onto the scope.
 *
 * The scope is an ellipse filling the board rather than a circle inside it:
 * a circular scope on a 16:9 screen wastes a third of the width, and the
 * range rings in the shader are drawn on the same un-corrected coordinates so
 * the two agree exactly.
 */
function project(
  x: number,
  y: number,
  z: number,
  viewport: Viewport,
): { x: number; y: number } {
  const range = PERIMETER + (RIM - PERIMETER) * z + y * 0.035;
  const bearing = x * Math.PI;
  return {
    x: viewport.width * 0.5 * (1 + Math.cos(bearing) * range),
    y: viewport.height * 0.5 * (1 + Math.sin(bearing) * range),
  };
}

export interface Viewport {
  width: number;
  height: number;
}

export interface EntityNode {
  root: HTMLElement;
  done: HTMLElement;
  rest: HTMLElement;
  rung: number;
  boundId: number | null;
}

export class Stage {
  private pool: EntityNode[] = [];

  constructor(private readonly container: HTMLElement) {}

  /** Grows the pool to hold `count` entities. Nodes are never destroyed. */
  private ensure(count: number): void {
    while (this.pool.length < count) {
      const root = document.createElement("div");
      root.className = "transmission";
      root.setAttribute("aria-hidden", "true");

      const done = document.createElement("span");
      done.className = "transmission-done";
      const rest = document.createElement("span");
      rest.className = "transmission-rest";

      root.append(done, rest);
      this.container.append(root);
      this.pool.push({ root, done, rest, rung: -1, boundId: null });
    }
  }

  /**
   * Writes one frame.
   *
   * `alpha` interpolates between each entity's previous and current position,
   * which is what keeps motion smooth on a 120Hz display even though the
   * simulation only steps at 60Hz.
   */
  render(
    entities: readonly Transmission[],
    viewport: Viewport,
    alpha: number,
    activeId: number | null,
  ): void {
    this.ensure(entities.length);

    for (let i = 0; i < this.pool.length; i++) {
      const node = this.pool[i];
      const entity = entities[i];

      if (!entity) {
        if (node.boundId !== null) {
          node.root.style.opacity = "0";
          node.root.style.transform = "translate3d(-9999px,0,0)";
          node.boundId = null;
        }
        continue;
      }

      // Bearing has to be interpolated the short way round, or a contact that
      // wraps past the far bearing sweeps all the way across the scope in one
      // frame.
      let dx = entity.x - entity.prevX;
      if (dx > 1) dx -= 2;
      else if (dx < -1) dx += 2;
      const x = entity.prevX + dx * alpha;
      const y = entity.prevY + (entity.y - entity.prevY) * alpha;
      const z = entity.prevZ + (entity.z - entity.prevZ) * alpha;

      const { x: px, y: py } = project(x, y, z, viewport);

      const rung = Math.min(RUNGS - 1, Math.floor((1 - z) * RUNGS));
      const isActive = entity.id === activeId;

      // Only ever transform and opacity. No scale, no filter, no box-shadow.
      node.root.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
      // Distant transmissions are quieter but never faint: they still have to
      // be read, and dimming upcoming text into illegibility is the standard
      // mistake on typing sites.
      node.root.style.opacity = String(Math.min(1, 0.86 + (1 - z) * 0.14));

      // Discrete attributes are only touched when they actually change, so a
      // rung change costs one re-rasterisation instead of sixty a second.
      if (node.rung !== rung) {
        node.root.dataset.rung = String(rung);
        node.rung = rung;
      }
      if (node.boundId !== entity.id) {
        node.boundId = entity.id;
        node.root.dataset.kind = entity.kind;
      }
      if (node.root.dataset.active !== String(isActive)) {
        node.root.dataset.active = String(isActive);
      }

      // Text is rewritten only when the decoded prefix changes, which happens
      // on a keystroke rather than on a frame.
      const doneText = entity.word.slice(0, entity.typed);
      const restText = entity.word.slice(entity.typed);
      if (node.done.textContent !== doneText) node.done.textContent = doneText;
      if (node.rest.textContent !== restText) node.rest.textContent = restText;
    }
  }

  /** Screen position of an entity, for spawning a particle burst. */
  positionOf(x: number, y: number, z: number, viewport: Viewport): { x: number; y: number } {
    return project(x, y, z, viewport);
  }

  clear(): void {
    for (const node of this.pool) {
      node.root.style.opacity = "0";
      node.root.style.transform = "translate3d(-9999px,0,0)";
      node.boundId = null;
    }
  }
}
