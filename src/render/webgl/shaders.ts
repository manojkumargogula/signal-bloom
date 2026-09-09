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
export const FRAGMENT_SOURCE = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uLightMode;

uniform vec3  uInk;
uniform vec3  uIon;
uniform vec3  uPlasma;
uniform vec3  uFlare;

#define MAX_BLOOMS 6
uniform vec4 uBlooms[MAX_BLOOMS];
uniform int  uBloomCount;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoothstep the interpolant so the field has no visible grid seams.
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
    p *= 2.02;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  // Aspect-correct coordinates centred on the screen, so the field does not
  // stretch when the window does.
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float t = uTime * 0.02;

  // Two counter-drifting layers read as depth without any parallax maths.
  float far  = fbm(p * 1.6 + vec2(t, t * 0.6));
  float near = fbm(p * 3.1 - vec2(t * 1.4, t * 0.9) + far * 0.4);

  float density = pow(far * 0.65 + near * 0.45, 1.7);

  // A slow vertical gradient keeps the horizon darker than the zenith, which
  // is what stops the field looking like flat noise.
  density *= mix(1.15, 0.55, uv.y);

  // ---- blooms ----------------------------------------------------------
  float ripple = 0.0;
  float glow = 0.0;

  for (int i = 0; i < MAX_BLOOMS; i++) {
    if (i >= uBloomCount) break;

    vec4 bloom = uBlooms[i];
    vec2 centre = bloom.xy * vec2(uResolution.x / uResolution.y, 1.0) * 0.5;
    float age = bloom.z;
    float strength = bloom.w;
    if (strength <= 0.0) continue;

    float dist = length(p - centre);

    // The ring expands and thins with age, so a decode reads as a single
    // outward pulse rather than a throb.
    float radius = age * 0.85;
    float width = 0.045 + age * 0.14;
    float ring = exp(-pow((dist - radius) / width, 2.0));
    float fade = 1.0 - clamp(age, 0.0, 1.0);

    ripple += ring * fade * strength;
    glow += exp(-dist * 7.0) * fade * fade * strength * 0.6;
  }

  // The ripple perturbs the field itself rather than being drawn on top,
  // which is what makes it look like the sky reacting.
  density += ripple * 0.5;

  // ---- stars ------------------------------------------------------------
  vec2 starGrid = uv * uResolution / 2.4;
  vec2 cell = floor(starGrid);
  float starSeed = hash(cell);
  float star = 0.0;
  if (starSeed > 0.9955) {
    vec2 offset = fract(starGrid) - 0.5;
    float twinkle = 0.65 + 0.35 * sin(uTime * 1.7 + starSeed * 40.0);
    star = smoothstep(0.42, 0.0, length(offset)) * twinkle;
  }

  // ---- colour -----------------------------------------------------------
  // Ion in the thin gas, plasma in the thick, flare only at the very core, so
  // the accent colours appear in a fixed order and the palette stays legible.
  vec3 tint = mix(uIon, uPlasma, clamp(density * 1.5, 0.0, 1.0));
  tint = mix(tint, uFlare, clamp(pow(density, 3.5) * 1.2, 0.0, 1.0));

  vec3 colour = uInk + tint * density * uIntensity;
  colour += uIon * glow * uIntensity;
  colour += vec3(star) * mix(0.9, 0.35, uLightMode);

  // Light theme inverts the relationship: the gas darkens the paper rather
  // than lighting the void, so the same field reads on white.
  if (uLightMode > 0.5) {
    vec3 shade = tint * density * uIntensity * 0.55 + uIon * glow * uIntensity * 0.5;
    colour = uInk - shade;
  }

  gl_FragColor = vec4(colour, 1.0);
}
`;

export type QualityTier = "high" | "medium" | "low" | "off";

export const OCTAVES_FOR_TIER: Record<Exclude<QualityTier, "off">, number> = {
  high: 5,
  medium: 3,
  low: 2,
};

/** Render scale per tier. The noise is low-frequency, so upscaling is invisible. */
export const SCALE_FOR_TIER: Record<Exclude<QualityTier, "off">, number> = {
  high: 0.66,
  medium: 0.5,
  low: 0.4,
};

export function fragmentSourceFor(tier: Exclude<QualityTier, "off">): string {
  return `#define OCTAVES ${OCTAVES_FOR_TIER[tier]}\n${FRAGMENT_SOURCE}`;
}
