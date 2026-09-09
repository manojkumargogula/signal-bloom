import { CLIMBER_HEIGHT, CLIMBER_WIDTH } from "./stage";

/**
 * The climber.
 *
 * One inline SVG body, moved and deformed by transform. Hand-authored rather
 * than generated, because a diffusion model cannot produce a consistent
 * sprite sheet — a four-frame run cycle comes back as four subtly different
 * characters — and because SVG stays crisp at any size, recolours per band
 * from tokens, and costs almost nothing to ship.
 *
 * ## What it has to communicate
 *
 * The reference's own redesign notes single this out, and they are right: the
 * character reacting to **every keystroke** is what makes the jump feel
 * earned across the word rather than fired at the end. So the crouch deepens
 * as the word fills, and completion releases it.
 *
 * The crouch runs out of resolution, though. It maxes at about a fifth of the
 * body height — roughly nine pixels — and across a nine-letter word that is
 * one pixel a letter, which nobody can see. So past six letters the slab's
 * fill sweep becomes the dominant per-letter channel and the crouch is the
 * supporting one. Both are always present; which one carries depends on the
 * word.
 */

/** How deep the crouch goes at a full word, as a fraction of body height. */
const CROUCH_MAX = 0.2;

/** Anticipation dips past the maximum, so release has a physical beat. */
const ANTICIPATION_SCALE = 1.45;

export interface ClimberPose {
  /** 0..1 across the active word. */
  charge: number;
  /** "grounded" | "anticipating" | "airborne" */
  phase: string;
  /** 0..1 through the leap. */
  jump: number;
  /** Set briefly after a wrong letter. */
  flinch: number;
  /** Which way the next platform lies, -1 or 1. */
  facing: number;
}

export class Climber {
  private el: SVGSVGElement | null = null;
  private body: SVGGElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  mount(): void {
    if (this.el) return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 32");
    svg.setAttribute("class", "climber");
    svg.setAttribute("aria-hidden", "true");

    // A technician in a signal array: hard hat, pack, boots. Deliberately
    // simple — it is read at about 40px while the player's attention is on a
    // word, so silhouette matters and detail does not.
    svg.innerHTML = `
      <g class="climber-body">
        <!-- pack -->
        <rect x="4" y="12" width="5" height="9" rx="1.5" class="climber-pack" />
        <!-- legs -->
        <rect class="climber-leg climber-leg-back" x="9" y="21" width="3.4" height="9" rx="1.6" />
        <rect class="climber-leg climber-leg-front" x="13" y="21" width="3.4" height="9" rx="1.6" />
        <!-- torso -->
        <rect x="8.5" y="11" width="8" height="11" rx="3" class="climber-torso" />
        <!-- arms -->
        <rect class="climber-arm climber-arm-back" x="7" y="12.5" width="2.8" height="8" rx="1.4" />
        <rect class="climber-arm climber-arm-front" x="15" y="12.5" width="2.8" height="8" rx="1.4" />
        <!-- head -->
        <circle cx="12.5" cy="7.5" r="4.2" class="climber-head" />
        <!-- hard hat -->
        <path d="M7.6 6.6a4.9 4.9 0 0 1 9.8 0z" class="climber-hat" />
        <rect x="6.6" y="6.2" width="11.8" height="1.6" rx="0.8" class="climber-hat" />
      </g>
    `;

    this.container.append(svg);
    this.el = svg;
    this.body = svg.querySelector(".climber-body");
  }

  /**
   * Positions and deforms the climber.
   *
   * Everything is written to CSS custom properties rather than to React
   * state. The crouch and the leap change every frame; routing them through a
   * render would put sixty renders a second on the critical path of a game
   * loop, for values no component needs to know.
   */
  render(pose: ClimberPose, x: number, y: number): void {
    const el = this.el;
    const body = this.body;
    if (!el || !body) return;

    // ---- the crouch ------------------------------------------------------
    let crouch = pose.charge * CROUCH_MAX;
    if (pose.phase === "anticipating") crouch = CROUCH_MAX * ANTICIPATION_SCALE;

    // ---- the leap --------------------------------------------------------
    // Asymmetric: 45% rise, 55% fall, so gravity reads heavier on the way
    // down. A symmetric parabola looks floaty.
    let lift = 0;
    let squash = 0;
    if (pose.phase === "airborne") {
      const t = pose.jump;
      if (t < 0.45) {
        const u = t / 0.45;
        lift = 1 - (1 - u) * (1 - u);
      } else {
        const u = (t - 0.45) / 0.55;
        lift = 1 - u * u;
      }
      // Stretched along the arc, most at the extremes.
      squash = -0.1 * (1 - Math.abs(lift - 0.5) * 2);
    } else if (pose.phase === "grounded" && pose.jump >= 1) {
      crouch = Math.max(crouch, 0);
    }

    const scaleY = 1 - crouch + squash;
    // Coupled, but not full volume preservation, which is too much at this
    // size and makes the body look like a balloon.
    const scaleX = 1 + 0.35 * (1 - scaleY);

    // Centred in explicit pixels, deliberately unlike the platforms, which
    // put `translate(-50%, -50%)` inside their transform string. Percentage
    // translation on an <svg> element does not reliably resolve against the
    // element's own box the way it does on a div, so the one place a fixed
    // pixel size is known -- here -- is where the offset belongs.
    const left = x - CLIMBER_WIDTH / 2 + pose.flinch * 4 * -pose.facing;
    const top = y - CLIMBER_HEIGHT - lift * 34;
    el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;

    body.style.transform = `scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;
    // Drives the limb swing in CSS, so the animation lives with the artwork.
    el.style.setProperty("--swing", lift.toFixed(3));
    el.style.setProperty("--facing", String(pose.facing));
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
    this.body = null;
  }
}
