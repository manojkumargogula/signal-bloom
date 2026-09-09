/**
 * WCAG 2.1 contrast gate for the design tokens.
 *
 * Parses the token blocks straight out of src/app/globals.css so the check can
 * never drift from the values actually shipped, then asserts every pair that
 * carries text. Runs in CI; a failing pair fails the build.
 */
import { readFileSync } from "node:fs";

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
  ["type-pending", "bg", 4.5, "upcoming text in the typing surface"],
  ["type-done", "bg", 4.5, "decoded text in the typing surface"],
  ["type-error", "bg", 4.5, "mistyped text"],
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

// The pending/done emphasis gap is what makes a typing surface readable at a
// glance. If they are too close, the player cannot see where they are.
for (const [name, vars] of THEMES) {
  const gap = ratio(vars["type-done"], vars["type-pending"]);
  const ok = gap >= 2.0;
  if (!ok) failed++;
  console.log(
    `\n  ${name}: pending -> done emphasis gap ${gap.toFixed(2)}:1 ${ok ? "ok" : "FAIL (need 2.0)"}`,
  );
}

console.log(failed === 0 ? "\nAll contrast pairs pass.\n" : `\n${failed} contrast failure(s).\n`);
process.exit(failed === 0 ? 0 : 1);
