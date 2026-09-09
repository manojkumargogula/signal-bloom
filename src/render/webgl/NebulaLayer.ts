import { fragmentSourceFor, SCALE_FOR_TIER, VERTEX_SOURCE, type QualityTier } from "./shaders";

/**
 * The ambient background layer.
 *
 * Runs at a fraction of native resolution and, at most tiers, on every other
 * frame. The nebula is the single largest frame cost in the whole renderer
 * and the noise is low-frequency, so halving both resolution and rate is
 * invisible and buys back most of the frame budget for the parts of the game
 * the player is actually looking at.
 *
 * Every failure path degrades to a CSS gradient rather than breaking: a
 * missing context, a failed compile, a lost context, or a machine that simply
 * cannot keep up. The game never depends on this layer existing.
 */

const MAX_BLOOMS = 6;
const BLOOM_LIFETIME_MS = 1400;

interface Bloom {
  x: number;
  y: number;
  bornAt: number;
  strength: number;
}

export interface NebulaPalette {
  ink: [number, number, number];
  ion: [number, number, number];
  plasma: [number, number, number];
  flare: [number, number, number];
  lightMode: boolean;
}

export class NebulaLayer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  private blooms: Bloom[] = [];
  private bloomData = new Float32Array(MAX_BLOOMS * 4);

  private tier: QualityTier = "high";
  private frame = 0;
  private failed = false;
  private palette: NebulaPalette | null = null;
  private intensity = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  get isRunning(): boolean {
    return this.gl !== null && !this.failed;
  }

  /**
   * Creates the context and compiles the program.
   *
   * Deliberately called after first paint, not during mount: context creation
   * plus shader compilation is tens of milliseconds of main-thread work, and
   * doing it eagerly would put it in front of the largest contentful paint.
   */
  init(tier: Exclude<QualityTier, "off">, palette: NebulaPalette): boolean {
    if (this.failed) return false;
    this.tier = tier;
    this.palette = palette;

    const gl =
      this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
        desynchronized: true,
      }) ?? null;

    if (!gl) {
      this.failed = true;
      return false;
    }
    this.gl = gl;

    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    return this.build(tier);
  }

  private build(tier: Exclude<QualityTier, "off">): boolean {
    const gl = this.gl;
    if (!gl) return false;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSourceFor(tier));
    if (!vertex || !fragment) {
      this.failed = true;
      return false;
    }

    const program = gl.createProgram();
    if (!program) {
      this.failed = true;
      return false;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this.failed = true;
      return false;
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    gl.useProgram(program);

    if (!this.buffer) {
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      // One full-screen triangle strip. No index buffer, no vertex data
      // beyond four corners.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    }

    const location = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      "uResolution", "uTime", "uIntensity", "uLightMode",
      "uInk", "uIon", "uPlasma", "uFlare", "uBlooms", "uBloomCount",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    return true;
  }

  setTier(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    if (tier !== "off" && this.gl && !this.failed) {
      this.build(tier);
      this.resize();
    }
  }

  setPalette(palette: NebulaPalette): void {
    this.palette = palette;
  }

  setIntensity(value: number): void {
    this.intensity = value;
  }

  /** Records a decoded word so the field ripples outward from it. */
  addBloom(x: number, y: number, now: number, strength = 1): void {
    this.blooms.push({ x, y, bornAt: now, strength });
    // Keep only the newest; an older ring has already faded past visibility.
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
  }

  resize(): void {
    const gl = this.gl;
    if (!gl || this.tier === "off") return;

    const scale = SCALE_FOR_TIER[this.tier];
    // Cap the device ratio at 2: beyond that the pixel cost doubles again for
    // a difference nobody can see in a soft noise field.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr * scale));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr * scale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  render(now: number): void {
    const gl = this.gl;
    const palette = this.palette;
    if (!gl || !this.program || this.failed || this.tier === "off" || !palette) return;

    // Ambient motion at 30Hz. The field drifts slowly enough that nobody can
    // tell, and it halves the cost of the most expensive layer.
    this.frame++;
    if (this.tier !== "high" && this.frame % 2 === 1) return;

    gl.useProgram(this.program);

    let count = 0;
    for (const bloom of this.blooms) {
      const age = (now - bloom.bornAt) / BLOOM_LIFETIME_MS;
      if (age >= 1 || count >= MAX_BLOOMS) continue;
      const base = count * 4;
      this.bloomData[base] = bloom.x;
      this.bloomData[base + 1] = bloom.y;
      this.bloomData[base + 2] = age;
      this.bloomData[base + 3] = bloom.strength;
      count++;
    }
    if (this.blooms.length > 0) {
      this.blooms = this.blooms.filter((b) => (now - b.bornAt) / BLOOM_LIFETIME_MS < 1);
    }

    gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.uTime, now / 1000);
    gl.uniform1f(this.uniforms.uIntensity, this.intensity);
    gl.uniform1f(this.uniforms.uLightMode, palette.lightMode ? 1 : 0);
    gl.uniform3fv(this.uniforms.uInk, palette.ink);
    gl.uniform3fv(this.uniforms.uIon, palette.ion);
    gl.uniform3fv(this.uniforms.uPlasma, palette.plasma);
    gl.uniform3fv(this.uniforms.uFlare, palette.flare);
    gl.uniform4fv(this.uniforms.uBlooms, this.bloomData);
    gl.uniform1i(this.uniforms.uBloomCount, count);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private onContextLost = (event: Event): void => {
    // Preventing the default is what makes a restore possible at all.
    event.preventDefault();
    this.program = null;
    this.buffer = null;
  };

  private onContextRestored = (): void => {
    if (this.tier === "off") return;
    this.failed = false;
    this.build(this.tier as Exclude<QualityTier, "off">);
    this.resize();
  };

  dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    this.gl = null;
    this.program = null;
    this.buffer = null;
  }
}

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("shader compile failed:", gl.getShaderInfoLog(shader));
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
