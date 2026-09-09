/**
 * WCAG 2.1 contrast gate for the design tokens.
 *
 * Parses the token blocks straight out of src/app/globals.css so the check can
 * never drift from the values actually shipped, then asserts every pair that
 * carries text. Runs in CI; a failing pair fails the build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector) {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`token block not found: ${selector}`);
  const open = css.indexOf("{", i);
  const end = css.indexOf("\n}", open);
  const body = css.slice(open + 1, end);
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => srgb(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Perceptual distance in OKLab, scaled by 100.
 *
 * A WCAG contrast ratio measures LUMINANCE only, which is the wrong
 * instrument for one pair here. The typed prefix of a word differs from the
 * letters still to come by hue and chroma -- an off-white going to the band's
 * saturated accent -- and that reads instantly at a luminance ratio of 1.3:1,
 * which the ratio would call a failure. So that pair is judged on perceptual
 * distance, and everything that genuinely is a text-on-background pair keeps
 * the ratio.
 */
function channels(hex) {
  let value = hex.replace("#", "").trim();
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function deltaE(a, b) {
  const [l1, m1, s1] = oklab(a);
  const [l2, m2, s2] = oklab(b);
  return Math.hypot(l1 - l2, m1 - m2, s1 - s2) * 100;
}

function oklab(hex) {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// [foreground token, background token, minimum ratio, what it is used for]
const PAIRS = [
  ["fg", "bg", 4.5, "body text"],
  ["fg", "bg-elev", 4.5, "text on raised surfaces"],
  ["fg", "bg-panel", 4.5, "text in panels"],
  ["fg-muted", "bg", 4.5, "secondary text"],
  ["fg-muted", "bg-elev", 4.5, "secondary text, raised"],
  ["fg-muted", "bg-panel", 4.5, "secondary text, panels"],
  ["fg-faint", "bg", 3.0, "decorative rules and labels only"],
  ["amber", "bg", 4.5, "the accent, as text"],
  ["amber", "bg-panel", 4.5, "accent text in panels"],
  ["amber", "bg-inset", 4.5, "accent text on inset surfaces"],
  ["amber-dim", "bg", 4.5, "de-emphasised accent text"],
  ["fault", "bg", 4.5, "error text"],
  ["fault", "bg-panel", 4.5, "error text in panels"],
  ["line-strong", "bg", 3.0, "visible borders"],
  // Chart marks need 3:1 against the surface they are drawn on, not 4.5:1 --
  // they are graphics, not text, and each is also directly labelled.
  ["series-net", "bg-panel", 3.0, "net WPM series mark"],
  ["series-raw", "bg-panel", 3.0, "raw WPM series mark"],
];

const THEMES = [
  ["dark", block(":root {")],
  ["light", block(':root[data-theme="light"]')],
];

let failed = 0;
for (const [name, vars] of THEMES) {
  console.log(`\n  ${name}`);
  for (const [fg, bg, min, use] of PAIRS) {
    if (!vars[fg] || !vars[bg]) {
      console.log(`    ?  --${fg} on --${bg}: token missing`);
      failed++;
      continue;
    }
    const r = ratio(vars[fg], vars[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `    ${ok ? "ok" : "FAIL"}  ${r.toFixed(2)}:1  (need ${min})  --${fg} on --${bg}  — ${use}`,
    );
  }
}

// The pending/done emphasis gap is what makes a word readable at a glance: if
// the typed prefix and the letters still to come are too close, the player
// cannot see where they are in the word. It lives per band now rather than in
// one global pair, because the words are set on the band's slab -- so the
// check is in the per-band block below, against `word` and `wordDone`.

// Every custom property a component references must actually be defined.
//
// Replacing the palette once left nine references to deleted tokens behind,
// which browsers resolve to nothing and render as an invalid colour -- no
// error, no warning, just a component quietly losing its colour. Cheap to
// catch, invisible otherwise.
{
  const defined = new Set(
    [...css.matchAll(/^\s+(--[\w-]+):/gm)].map((m) => m[1]),
  );

  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name) && !full.endsWith("globals.css")) {
        sources.push(full);
      }
    }
  };
  walk(new URL("../src", import.meta.url).pathname);

  const missing = new Map();
  for (const file of sources) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/var\((--[\w-]+)/g)) {
      const token = match[1];
      if (defined.has(token)) continue;
      if (!missing.has(token)) missing.set(token, new Set());
      missing.get(token).add(file.replace(/^.*\/src\//, "src/"));
    }
    // Tailwind arbitrary values, e.g. text-[var(--amber)], are caught above;
    // readColour("--amber") style lookups are matched here.
    for (const match of body.matchAll(/readColour\(\s*"(--[\w-]+)"/g)) {
      const token = match[1];
      if (defined.has(token)) continue;
      if (!missing.has(token)) missing.set(token, new Set());
      missing.get(token).add(file.replace(/^.*\/src\//, "src/"));
    }
  }

  if (missing.size > 0) {
    console.log("\n  undefined design tokens referenced:");
    for (const [token, files] of missing) {
      console.log(`    FAIL  ${token}  used in ${[...files].join(", ")}`);
      failed++;
    }
  } else {
    console.log(`\n  all referenced tokens are defined (${defined.size} in the palette)`);
  }
}

// ---------------------------------------------------------------- bands ----
//
// The world is colourful and changes every band, which is only safe because a
// platform word is never set against the sky -- it sits on a slab whose colour
// is defined alongside it. So the pairs that matter are word-on-slab and
// edge-on-slab, and they are checked for every theme. A new band theme cannot
// ship unreadable.
{
  const bands = readFileSync(new URL("../src/data/bands.ts", import.meta.url), "utf8");

  // Any hex that is not plain ASCII is a typo, and one slipped in while these
  // were being written. Cheap to catch, invisible otherwise.
  const suspect = [...bands.matchAll(/"(#[^"]*)"/g)]
    .map((m) => m[1])
    .filter((hex) => !/^#[0-9a-fA-F]{3,8}$/.test(hex));
  if (suspect.length > 0) {
    console.log("\n  malformed colour values in bands.ts:");
    for (const hex of suspect) {
      console.log(`    FAIL  ${JSON.stringify(hex)}`);
      failed++;
    }
  }

  const hex = "(#[0-9a-fA-F]{3,8})";
  const themes = [
    ...bands.matchAll(
      new RegExp(
        `id:\\s*"([^"]+)"` +
          `[\\s\\S]*?slab:\\s*"${hex}"` +
          `[\\s\\S]*?slabEdge:\\s*"${hex}"` +
          `[\\s\\S]*?word:\\s*"${hex}"` +
          `[\\s\\S]*?wordDone:\\s*"${hex}"` +
          `[\\s\\S]*?water:\\s*"${hex}"` +
          `[\\s\\S]*?waterFoam:\\s*"${hex}"`,
        "g",
      ),
    ),
  ];

  if (themes.length === 0) {
    console.log("\n  FAIL  could not parse any band themes out of bands.ts");
    failed++;
  } else {
    console.log(`\n  band themes (${themes.length})`);
    for (const [, id, slab, edge, word, done, water, foam] of themes) {
      // `skyFallback` runs top to bottom and the water meets the BOTTOM of
      // it, so that stop is the colour the flood is judged against.
      const skyBottom = skyLow(bands, id);
      if (!skyBottom) {
        console.log(`    FAIL  ${id} — could not read skyFallback`);
        failed++;
        continue;
      }

      // The word and its typed prefix are body text on the slab and carry the
      // whole game, so both take the full 4.5:1. The lit edge is a graphic.
      //
      // The waterline is checked against the sky because it is the fail state
      // made visible -- the distance between the climber and the water IS the
      // thing the player has to read -- and it shipped invisible once: the
      // dawn band's foam was the app's amber accent on an amber sky, so the
      // crest line simply was not there. It is a non-text graphic, hence
      // 3:1 per WCAG 1.4.11. The body of water only needs to be separable
      // from the sky, so it takes a plain 2:1 floor.
      const checks = [
        ["word on slab", word, slab, 4.5],
        ["typed prefix on slab", done, slab, 4.5],
        ["active frame on slab", edge, slab, 3.0],
        ["foam crest on sky", foam, skyBottom, 3.0],
        ["water body on sky", water, skyBottom, 2.0],
      ];
      for (const [use, fg, bg, min] of checks) {
        const r = ratio(fg, bg);
        const ok = r >= min;
        if (!ok) failed++;
        console.log(
          `    ${ok ? "ok" : "FAIL"}  ${r.toFixed(2)}:1  (need ${min})  ${id} — ${use}`,
        );
      }

      // Where you are in the word, made visible. The typed prefix is
      // distinguished by hue rather than by lightness, so this is a
      // perceptual distance and not a contrast ratio -- 15 is the floor at
      // which a full-colour reader can separate two marks at a glance.
      const emphasis = deltaE(done, word);
      const emphasisOk = emphasis >= 15;
      if (!emphasisOk) failed++;
      console.log(
        `    ${emphasisOk ? "ok" : "FAIL"}  ΔE ${emphasis.toFixed(1)}  (need 15)  ` +
          `${id} — typed prefix against the letters to come`,
      );
    }
  }
}

/**
 * The bottom stop of a band's sky gradient, which is the colour the flood
 * rises against.
 */
function skyLow(source, id) {
  const theme = source.slice(source.indexOf(`id: "${id}"`));
  const m = /skyFallback:\s*\["(#[0-9a-fA-F]{3,8})",\s*"(#[0-9a-fA-F]{3,8})"\]/.exec(theme);
  return m ? m[2] : null;
}

console.log(failed === 0 ? "\nAll checks pass.\n" : `\n${failed} failure(s).\n`);
process.exit(failed === 0 ? 0 : 1);
