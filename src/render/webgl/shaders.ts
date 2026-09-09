/**
 * The nebula field.
 *
 * Shaders are TypeScript modules exporting template literals rather than
 * .glsl files fetched at runtime. Three reasons: a static export on a subpath
 * would need the fetch path prefixed, the source gets minified with everything
 * else, and a typo is a build error rather than a blank screen.
 */

export const VERTEX_SOURCE = /* glsl */ `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Fragment shader.
 *
 * The signature element lives here: `uBlooms` carries the most recent decoded
 * words as (x, y, age, strength). Each one drives a ring travelling outward
 * through the noise field, so decoding a word visibly disturbs the sky. That
 * coupling between the text layer and the background is the thing the game is
 * remembered by, and it costs four floats per event.
 *
 * OCTAVES is baked in with a #define rather than read from a uniform, because
 * a loop bound that varies per frame prevents the driver from unrolling it.
 * Three variants are compiled and swapped by the quality tier instead.
 */
/**
 * Fragment shader — the phosphor scope.
 *
 * This is a piece of equipment, not a backdrop: faint range rings, a slow
 * sweep, and phosphor grain, all in one amber hue. The centre of the frame is
 * deliberately held back, because that is where the words live and in a typing
 * game unreadable text is not a cosmetic problem — it is the product failing.
 *
 * The signature element lives here. `uBlooms` carries recently decoded words
 * as (x, y, age, strength), and each one drives a real echo travelling outward
 * across the scope. Decoding a word disturbs the screen it is drawn on, which
 * costs four floats per event and is the thing the game is remembered by.
 *
 * OCTAVES is baked in with a #define rather than read from a uniform: a loop
 * bound that varies per frame stops the driver unrolling it. Three variants
 * are compiled and swapped by the quality tier instead.
 */
export const FRAGMENT_SOURCE = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uLightMode;

uniform vec3  uInk;
uniform vec3  uAmber;

#define MAX_BLOOMS 6
uniform vec4 uBlooms[MAX_BLOOMS];
uniform int  uBloomCount;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    total += noise(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec2 uv = vUv;

  // Scope coordinates: -1..1 on both axes, so the scope is an ellipse filling
  // the board rather than a circle inside it. A circular scope on a 16:9
  // screen wastes a third of the width. src/render/stage.ts projects contacts
  // onto exactly these coordinates, so the rings and the words agree.
  vec2 q = (uv - 0.5) * 2.0;
  float radius = length(q);

  float signal = 0.0;

  // ---- range rings ------------------------------------------------------
  // Concentric, evenly spaced, faint. They make the screen read as calibrated
  // rather than merely textured.
  float rings = abs(fract(radius * 3.5) - 0.5) * 2.0;
  signal += pow(rings, 26.0) * 0.075;

  // ---- the perimeter ----------------------------------------------------
  // Where contacts breach, drawn so the player can actually see the line they
  // are defending. Brighter than the range rings because it is the only ring
  // that means anything mechanically.
  float perimeter = exp(-pow((radius - 0.3) / 0.006, 2.0));
  signal += perimeter * 0.36;

  // ---- sweep ------------------------------------------------------------
  // One slow rotation. The trailing decay is what makes it read as a sweep
  // rather than a spinning line.
  float angle = atan(q.y, q.x);
  float sweep = fract((angle / 6.2831853) - uTime * 0.045);
  signal += pow(1.0 - sweep, 20.0) * 0.14;

  // ---- drifting return --------------------------------------------------
  // Low, slow noise, so the scope is never perfectly still. Sampled at a low
  // frequency on purpose: this is the only fbm call in the shader and the
  // only reason the octave count matters at all.
  float drift = fbm(q * 1.4 + vec2(uTime * 0.014, uTime * 0.009));
  signal += drift * drift * 0.16;

  // ---- echoes -----------------------------------------------------------
  // A decoded word pings outward from where it was destroyed.
  float echo = 0.0;
  float core = 0.0;

  for (int i = 0; i < MAX_BLOOMS; i++) {
    if (i >= uBloomCount) break;

    vec4 bloom = uBlooms[i];
    if (bloom.w <= 0.0) continue;

    // Blooms arrive already in scope coordinates.
    vec2 centre = bloom.xy;
    float age = bloom.z;
    float dist = length(q - centre);

    float front = age * 1.5;
    float width = 0.05 + age * 0.2;
    float ring = exp(-pow((dist - front) / width, 2.0));
    float fade = 1.0 - clamp(age, 0.0, 1.0);

    echo += ring * fade * bloom.w;
    core += exp(-dist * 9.0) * fade * fade * bloom.w * 0.7;
  }

  signal += echo * 0.7 + core * 0.8;

  // ---- the clearing -----------------------------------------------------
  // The single most important lines in the shader. Contacts converge on the
  // middle, so the middle is held back to stay close to the background
  // colour: the scope is the instrument, the words are the subject, and in a
  // typing game the words always win. The perimeter is exempted, because it
  // is the one mark the player needs to see.
  float quiet = smoothstep(0.0, 0.42, abs(radius - 0.1));
  signal *= mix(0.28, 1.0, quiet);
  signal += perimeter * 0.26;

  // ---- phosphor grain ---------------------------------------------------
  // Animated, so it reads as a live screen rather than as a dirty texture.
  float grain = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
  signal += grain * 0.02;

  signal = max(signal, 0.0) * uIntensity;

  // Light mode has no phosphor to glow: the same signal darkens the paper
  // instead of lighting the void, which is the only way one hue reads on both.
  vec3 colour = uLightMode > 0.5
    ? uInk - uAmber * signal * 0.30
    : uInk + uAmber * signal;

  gl_FragColor = vec4(colour, 1.0);
}
`;

export type QualityTier = "high" | "medium" | "low" | "off";

export const OCTAVES_FOR_TIER: Record<Exclude<QualityTier, "off">, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Render scale per tier. The signal is low-frequency, so upscaling is invisible. */
export const SCALE_FOR_TIER: Record<Exclude<QualityTier, "off">, number> = {
  high: 0.5,
  medium: 0.38,
  low: 0.28,
};

export function fragmentSourceFor(tier: Exclude<QualityTier, "off">): string {
  return `#define OCTAVES ${OCTAVES_FOR_TIER[tier]}\n${FRAGMENT_SOURCE}`;
}
