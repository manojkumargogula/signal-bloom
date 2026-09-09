/**
 * Decode bursts, on a 2D canvas overlay.
 *
 * Structure-of-arrays over typed arrays, with a fixed pool and no allocation
 * during play — a burst that allocates is a burst that causes a GC pause, and
 * a GC pause in a typing game is a dropped keystroke.
 *
 * Deliberately cheap: no shadowBlur, no per-particle save/restore, and no
 * gradients. Particles are drawn as squares batched by colour, which at this
 * size is indistinguishable from circles and several times faster.
 */

const MAX_PARTICLES = 600;

export interface BurstOptions {
  /** Screen position in CSS pixels. */
  x: number;
  y: number;
  /** 0..1; scales count and speed. */
  power: number;
  colour: string;
}

export class ParticleLayer {
  private ctx: CanvasRenderingContext2D | null;

  private px = new Float32Array(MAX_PARTICLES);
  private py = new Float32Array(MAX_PARTICLES);
  private vx = new Float32Array(MAX_PARTICLES);
  private vy = new Float32Array(MAX_PARTICLES);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private size = new Float32Array(MAX_PARTICLES);
  private colour: string[] = new Array(MAX_PARTICLES).fill("#4ff0d0");

  private cursor = 0;
  private active = 0;
  private dpr = 1;
  private budget = MAX_PARTICLES;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: true });
  }

  setBudget(budget: number): void {
    this.budget = Math.max(0, Math.min(budget, MAX_PARTICLES));
  }

  resize(): void {
    // Particles are soft, so rendering them below native resolution is free
    // quality. Three quarters is the point where it stops being noticeable.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  burst(options: BurstOptions): void {
    if (this.budget === 0) return;

    const count = Math.round(14 + options.power * 26);
    for (let i = 0; i < count; i++) {
      if (this.active >= this.budget) break;

      // Ring the pool. An overwritten particle was the oldest, so it was
      // about to expire anyway.
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (40 + Math.random() * 140) * (0.6 + options.power * 0.8);

      this.px[slot] = options.x;
      this.py[slot] = options.y;
      this.vx[slot] = Math.cos(angle) * speed;
      this.vy[slot] = Math.sin(angle) * speed;
      const life = 380 + Math.random() * 420;
      this.life[slot] = life;
      this.maxLife[slot] = life;
      this.size[slot] = 1.2 + Math.random() * 2.4;
      this.colour[slot] = options.colour;
      this.active++;
    }
  }

  step(dtMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.active === 0) return;

    ctx.scale(this.dpr, this.dpr);

    const dt = dtMs / 1000;
    let live = 0;
    // Batch by colour so the fill style changes a handful of times per frame
    // rather than once per particle.
    let currentColour = "";

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;

      this.life[i] -= dtMs;
      if (this.life[i] <= 0) continue;

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      // Drag, so particles decelerate into a settle rather than flying off.
      this.vx[i] *= 0.94;
      this.vy[i] *= 0.94;
      this.vy[i] += 26 * dt;

      const t = this.life[i] / this.maxLife[i];
      if (this.colour[i] !== currentColour) {
        currentColour = this.colour[i];
        ctx.fillStyle = currentColour;
      }
      ctx.globalAlpha = t * t;
      const s = this.size[i] * t;
      ctx.fillRect(this.px[i] - s, this.py[i] - s, s * 2, s * 2);
      live++;
    }

    ctx.globalAlpha = 1;
    this.active = live;
  }

  clear(): void {
    this.life.fill(0);
    this.active = 0;
    const ctx = this.ctx;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  get activeCount(): number {
    return this.active;
  }
}
