import type { QualityTier } from "../webgl/shaders";

/**
 * The flood, drawn.
 *
 * ## Why this is canvas and not CSS
 *
 * The first version was two SVG-masked bands of colour translating sideways at
 * a constant rate. It undulated, and it still did not look like water, for a
 * reason worth writing down: a fixed wave shape moving at a fixed speed is a
 * conveyor belt. Real water reads as water because several wave trains of
 * different lengths travel at different speeds in different directions, so no
 * crest ever repeats and the surface appears to move *through* itself. That is
 * a sum of sines evaluated per column, which CSS cannot express and a canvas
 * path can, at the cost of one path per frame.
 *
 * ## What makes it read as a liquid
 *
 * Four things, in order of how much they contribute:
 *
 * 1. **Four wave trains at non-harmonic wavelengths, two going each way.**
 *    Non-harmonic is the load-bearing word: harmonic components share a period
 *    and the whole surface visibly loops. These do not, so the pattern takes
 *    minutes to come back around and the eye never finds the repeat.
 * 2. **Specular glints on the crests.** A bright short mark where the surface
 *    is near a peak AND nearly level -- which is exactly where a real surface
 *    turns its face to the light. This is the single strongest cue that a
 *    coloured shape is wet, and it is why the CSS version looked like paper.
 * 3. **A subsurface light band that follows the curve** rather than sitting on
 *    a straight line under it, so light appears to enter the water.
 * 4. **Depth falloff**, steeply, because light in water does drop away fast --
 *    and because it keeps a full screen of water peripheral while the player
 *    is reading a word two platforms up.
 *
 * ## What it deliberately does not do
 *
 * No shadow blur, no per-pixel work, no gradient rebuilt per frame, and no
 * allocation in `render` -- the surface heights live in one reused Float32
 * array. The motion budget also forbids the water from adding any vertical
 * motion that competes with the camera, so the swell amplitude is small and
 * the crest speeds are slow; the water's job is to be a legible threat in the
 * periphery, not a feature.
 */

/**
 * The wave trains: amplitude in pixels, wavelength in pixels, speed in pixels
 * per second, and direction.
 *
 * Wavelengths are deliberately mutually non-harmonic (167, 97, 61, 37 -- all
 * prime, so no two share a factor). Amplitudes fall off with wavelength, which
 * is how real wind waves distribute energy, and the total is about 8px: enough
 * to be unmistakably a surface, small enough that it never competes with the
 * climb.
 */
const WAVES: readonly { amp: number; length: number; speed: number }[] = [
  { amp: 3.6, length: 167, speed: 15 },
  { amp: 2.3, length: 97, speed: -11 },
  { amp: 1.3, length: 61, speed: 21 },
  { amp: 0.8, length: 37, speed: -27 },
];

/** One sample every this many CSS pixels. Below ~4 the extra points are free but invisible. */
const STEP = 4;

/** How deep the lit band under the surface goes, in pixels. */
const SHEEN_DEPTH = 26;

export interface WaterColours {
  /** The body of the water. */
  water: string;
  /** The crest, the glints and the sheen. */
  foam: string;
}

/** The colours the canvas falls back to before a band has been applied. */
const DEFAULT_COLOURS: WaterColours = { water: "#2a4a4e", foam: "#fff2d0" };

export class WaterLayer {
  private ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private width = 0;
  private height = 0;

  /** Surface height per sample column, reused every frame. */
  private surface = new Float32Array(0);

  /** Seconds of wave time. Advanced by the caller, so pausing freezes it. */
  private time = 0;

  private tier: QualityTier = "high";
  private frozen = false;

  private colours: WaterColours = DEFAULT_COLOURS;

  /** Rebuilt only when the colours or the geometry change, never per frame. */
  private bodyFill: CanvasGradient | null = null;
  private sheenFill: CanvasGradient | null = null;
  private fillKey = "";

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: true });
  }

  /**
   * Under reduced motion the waves hold still.
   *
   * The LEVEL still rises, because the rising level is the gameplay and not
   * decoration. What goes is the travelling crest, which is the part that
   * moves in the periphery while a word is being read.
   */
  setMotion(animated: boolean): void {
    this.frozen = !animated;
  }

  setTier(tier: QualityTier): void {
    this.tier = tier;
  }

  /**
   * Picks up the band's water colours from the stylesheet.
   *
   * Canvas cannot use a custom property, but it can be TOLD one -- and reading
   * the same `--water` and `--water-foam` the rest of the world uses keeps a
   * single source of truth for the palette. Passing the hexes in from the
   * theme object instead was the first version, and it meant the canvas
   * silently ignored any override applied to the element, which is exactly
   * what `scripts/dev/water.mjs` does to paint five bands in one run.
   *
   * `getComputedStyle` forces a style recalculation, so this is called on a
   * band boundary and never from the frame loop.
   */
  readColours(): void {
    const styles = getComputedStyle(this.canvas);
    const water = styles.getPropertyValue("--water").trim();
    const foam = styles.getPropertyValue("--water-foam").trim();
    this.colours = {
      water: water || DEFAULT_COLOURS.water,
      foam: foam || DEFAULT_COLOURS.foam,
    };
    this.fillKey = "";
  }

  resize(): void {
    // Full device resolution, unlike the particle layer: this draws a thin
    // bright line across the whole screen, and a crest rendered at three
    // quarters resolution is visibly soft in a way a spark is not.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.fillKey = "";
    }
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;

    const columns = Math.ceil(this.width / STEP) + 2;
    if (this.surface.length !== columns) this.surface = new Float32Array(columns);

    // A resize already throws the cached gradients away, so re-reading the
    // palette here is one extra style read on an event that is expensive
    // anyway -- and it means a theme change never needs its own plumbing.
    this.readColours();
  }

  /** Advances wave time. Separate from `render` so a paused game holds still. */
  step(frameMs: number): void {
    if (!this.frozen) this.time += frameMs / 1000;
  }

  /**
   * Draws the water with its surface at `surfaceY` CSS pixels from the top.
   *
   * `danger` warms the crest and brightens the sheen when the climber is close
   * to drowning. It is a colour change rather than a new animation: the run is
   * decided in the last fifth of the gap, and a flashing surface in the
   * periphery is the one thing the motion budget will not allow.
   */
  render(surfaceY: number, danger: boolean): void {
    const colours = this.colours;
    const ctx = this.ctx;
    if (!ctx || this.width === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Entirely below the screen: nothing to draw, and no path to build.
    if (surfaceY > this.height + 12) return;

    const columns = this.surface.length;
    const flat = this.tier === "off";

    // ---- the surface, one column at a time -----------------------------
    let peak = surfaceY;
    for (let i = 0; i < columns; i++) {
      const x = i * STEP;
      let y = surfaceY;
      if (!flat) {
        for (const wave of WAVES) {
          const phase = (x / wave.length + (this.time * wave.speed) / wave.length) * Math.PI * 2;
          y += Math.sin(phase) * wave.amp;
        }
      }
      this.surface[i] = y;
      if (y < peak) peak = y;
    }

    this.ensureFills(surfaceY, danger);

    // ---- the body ------------------------------------------------------
    ctx.beginPath();
    ctx.moveTo(0, this.surface[0]);
    for (let i = 1; i < columns; i++) ctx.lineTo(i * STEP, this.surface[i]);
    ctx.lineTo((columns - 1) * STEP, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    if (this.bodyFill) {
      ctx.fillStyle = this.bodyFill;
      ctx.fill();
    }

    // ---- light entering the water --------------------------------------
    // A band that follows the crest instead of sitting on a straight line
    // under it, so the light appears to enter the surface rather than to be
    // painted near it.
    if (this.sheenFill && !flat) {
      ctx.beginPath();
      ctx.moveTo(0, this.surface[0]);
      for (let i = 1; i < columns; i++) ctx.lineTo(i * STEP, this.surface[i]);
      for (let i = columns - 1; i >= 0; i--) {
        ctx.lineTo(i * STEP, this.surface[i] + SHEEN_DEPTH);
      }
      ctx.closePath();
      ctx.fillStyle = this.sheenFill;
      ctx.fill();
    }

    // ---- the crest -----------------------------------------------------
    // Drawn as short segments whose brightness follows how high that stretch
    // of surface stands, NOT as one stroke across the width.
    //
    // This is the difference between water and a cartoon. A uniform stroke
    // along the whole surface is an outline, and the eye reads an outline as
    // the edge of a solid object -- the first version looked like a strip of
    // beach. Real foam is where the water is actually breaking, so it appears
    // on the crests and vanishes in the troughs, and the line has to be
    // discontinuous for the surface to look like a fluid at all.
    ctx.strokeStyle = colours.foam;
    ctx.lineWidth = danger ? 1.8 : 1.4;
    ctx.lineCap = "round";
    for (let i = 0; i < columns - 1; i++) {
      const y = this.surface[i];
      // 0 in the deepest trough, 1 on the highest crest.
      const lift = flat ? 1 : clamp01((surfaceY + 4 - y) / 9);
      // A floor plus a rise, not a rise from nothing. Modulating all the way
      // to transparent made the line DOTTED at four-pixel segments, which
      // reads as a dashed border rather than as foam; the floor keeps the
      // surface continuous and the crests still brighten by three times.
      const alpha = (danger ? 0.34 : 0.24) + Math.pow(lift, 1.5) * (danger ? 0.56 : 0.42);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(i * STEP, y);
      ctx.lineTo((i + 1) * STEP, this.surface[i + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- glints --------------------------------------------------------
    // Where the surface is near a local peak and nearly level: the places a
    // real surface turns its face to the light. Found from the samples
    // already computed, so this costs a comparison per column.
    //
    // Sparse on purpose. Every crest catching light is what makes fake water
    // look like tinsel, so only crests standing well above the field qualify.
    if (!flat && this.tier !== "low") {
      ctx.fillStyle = colours.foam;
      for (let i = 2; i < columns - 2; i++) {
        const y = this.surface[i];
        const isPeak = y <= this.surface[i - 1] && y <= this.surface[i + 1];
        if (!isPeak) continue;
        const prominence = (surfaceY - y) / 8;
        if (prominence < 0.74) continue;
        ctx.globalAlpha = Math.min(0.42, (prominence - 0.74) * 1.1);
        ctx.fillRect(i * STEP - 3, y - 0.5, 7, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Builds the two gradients, keyed so they are rebuilt only when something
   * they depend on changes.
   *
   * A `createLinearGradient` per frame is a per-frame allocation, and the
   * colours only change on a band boundary.
   */
  private ensureFills(surfaceY: number, danger: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const colours = this.colours;
    const key = `${Math.round(surfaceY / 8)}|${colours.water}|${colours.foam}|${danger}|${this.height}`;
    if (key === this.fillKey) return;
    this.fillKey = key;

    const body = ctx.createLinearGradient(0, surfaceY, 0, this.height);
    body.addColorStop(0, mix(colours.water, colours.foam, danger ? 0.22 : 0.12));
    body.addColorStop(0.1, colours.water);
    body.addColorStop(1, mix(colours.water, "#000000", 0.58));
    this.bodyFill = body;

    const sheen = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + SHEEN_DEPTH);
    sheen.addColorStop(0, rgba(colours.foam, danger ? 0.3 : 0.18));
    sheen.addColorStop(1, rgba(colours.foam, 0));
    this.sheenFill = sheen;
  }

  dispose(): void {
    this.ctx = null;
    this.surface = new Float32Array(0);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Parses `#rgb`/`#rrggbb` into channels. Anything else falls back to mid grey. */
function channels(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  if (value.length === 3) {
    return [
      parseInt(value[0] + value[0], 16),
      parseInt(value[1] + value[1], 16),
      parseInt(value[2] + value[2], 16),
    ];
  }
  if (value.length >= 6) {
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }
  return [128, 128, 128];
}

/**
 * Blends two hex colours.
 *
 * Plain sRGB rather than OKLab, unlike the CSS elsewhere: these are two
 * closely related colours a few percent apart, where the perceptual space buys
 * nothing, and the conversion would run on a band change rather than being
 * free at style-computation time.
 */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r} ${g} ${bl})`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
