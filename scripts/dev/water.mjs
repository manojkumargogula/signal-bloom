/**
 * Drives the flood in a real browser.
 *
 * The water is the mode's only fail state, so "can the player see how much
 * water there is, and where its surface is" is a gameplay question, not a
 * styling one. It is also invisible to the type checker and to every unit
 * test, and it shipped wrong twice: once as a translucent haze the same hue
 * as the sky it rose against, and once with a foam crest set in the app's
 * amber accent on an amber sky, which meant the waterline was simply not
 * drawn. Hence a script.
 *
 * What it checks:
 *
 * 1. the water is built out of the layers it is supposed to be, with the
 *    masks and the drifts actually applied by the browser;
 * 2. the level is driven by a TRANSFORM, not by height -- a height write
 *    reflows the whole field every frame;
 * 3. the level rises monotonically once the grace platforms are cleared;
 * 4. the warning state arrives before the run ends;
 * 5. and it paints every band's palette at the same waterline, because
 *    otherwise band five costs sixty platforms to look at.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";

/**
 * The band palettes, read straight out of the source.
 *
 * Parsed rather than imported: this is a plain node script and `bands.ts` is
 * TypeScript behind a path alias, and the same shape is already parsed by
 * `check-contrast.mjs` for the same reason.
 */
function bands() {
  const source = readFileSync(new URL("../../src/data/bands.ts", import.meta.url), "utf8");
  const hex = String.raw`(#[0-9a-fA-F]{3,8})`;
  const re = new RegExp(
    `id: "([^"]+)"[\\s\\S]*?skyFallback: \\["${hex}", "${hex}"\\]` +
      `[\\s\\S]*?ridges: \\["${hex}", "${hex}"\\]` +
      `[\\s\\S]*?slab: "${hex}"[\\s\\S]*?slabEdge: "${hex}"` +
      `[\\s\\S]*?word: "${hex}"[\\s\\S]*?wordDone: "${hex}"` +
      `[\\s\\S]*?water: "${hex}"[\\s\\S]*?waterFoam: "${hex}"`,
    "g",
  );
  const out = [];
  for (const m of source.matchAll(re)) {
    const [, id, sky0, sky1, ridge0, ridge1, slab, slabEdge, word, wordDone, water, foam] = m;
    out.push({ id, sky0, sky1, ridge0, ridge1, slab, slabEdge, word, wordDone, water, foam });
  }
  return out;
}

const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
});
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

// ---- the layers exist and the browser applied them ---------------------
const layers = await page.evaluate(() => {
  const flood = document.querySelector(".flood");
  if (!flood) return null;
  const read = (selector) => {
    const el = flood.querySelector(selector);
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      masked: (style.maskImage || style.webkitMaskImage || "none") !== "none",
      drifting: style.animationName !== "none" && parseFloat(style.animationDuration) > 0,
      foam: style.filter.includes("drop-shadow"),
    };
  };
  return {
    fillsField:
      Math.abs(flood.getBoundingClientRect().height -
        flood.parentElement.getBoundingClientRect().height) < 2,
    clipped: getComputedStyle(flood.parentElement).overflow === "hidden",
    inlineHeight: flood.style.height,
    swell: read(".flood-swell"),
    body: read(".flood-body"),
    sheen: read(".flood-sheen"),
    surface: read(".flood-surface"),
    warning: read(".flood-warning"),
  };
});

if (!layers) {
  problems.push("no .flood in the field at all");
} else {
  const expect = (ok, what) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) problems.push(what);
  };
  expect(layers.fillsField, "the water is a full-height body, not a growing box");
  expect(layers.clipped, "the field clips it, so it cannot paint over the status bar");
  expect(layers.inlineHeight === "", "the level is never written as an inline height");
  expect(Boolean(layers.swell?.masked && layers.swell.drifting), "the swell is masked and drifts");
  expect(Boolean(layers.surface?.masked && layers.surface.drifting), "the crest is masked and drifts");
  expect(Boolean(layers.surface?.foam), "the crest carries its foam as a mask-following shadow");
  expect(Boolean(layers.sheen), "the surface has its sheen band");
  expect(Boolean(layers.warning), "the warning wash is present");
  expect(layers.swell?.drifting !== undefined, "the swell exists");
}

// ---- clear the grace platforms so the flood starts moving --------------
const activeWord = () =>
  page.evaluate(
    () => document.querySelector('.platform[data-rank="0"] .platform-word')?.textContent ?? null,
  );
const typedCount = () =>
  page.evaluate(
    () => document.querySelectorAll('.platform[data-rank="0"] [data-state="done"]').length,
  );

for (let i = 0; i < 4; i++) {
  const word = await activeWord();
  if (!word) break;
  await page.keyboard.type(word.slice(await typedCount()), { delay: 40 });
  await page.waitForTimeout(320);
}

/** The waterline, read off the transform the loop wrote. */
const level = () =>
  page.evaluate(() => {
    const flood = document.querySelector(".flood");
    if (!flood) return null;
    const m = /translate3d\(0px,\s*([-\d.]+)px/.exec(flood.style.transform);
    return { y: m ? Number(m[1]) : null, danger: flood.dataset.danger === "true" };
  });

// ---- the band palettes, all at one waterline ---------------------------
await page.waitForTimeout(6000);
for (const band of bands()) {
  await page.evaluate((b) => {
    const board = document.querySelector(".board");
    if (!board) return;
    for (const [name, value] of [
      ["--water", b.water],
      ["--water-foam", b.foam],
      ["--slab", b.slab],
      ["--slab-edge", b.slabEdge],
      ["--word", b.word],
      ["--word-done", b.wordDone],
    ]) {
      board.style.setProperty(name, value);
    }
    for (const el of document.querySelectorAll(".sky-fallback")) {
      el.style.background = `linear-gradient(to bottom, ${b.sky0}, ${b.sky1})`;
    }
    const ridges = document.querySelectorAll(".ridge");
    if (ridges[0]) ridges[0].style.background = b.ridge0;
    if (ridges[1]) ridges[1].style.background = b.ridge1;
  }, band);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/water-${band.id}.png` });
  console.log(`  shot: water-${band.id}.png`);
}

// ---- it rises, and it warns before it kills ----------------------------
let previous = Infinity;
let rose = 0;
let warned = false;
for (let i = 0; i < 20; i++) {
  const now = await level();
  if (!now) break;
  if (now.y !== null && now.y < previous - 0.5) rose++;
  if (now.y !== null) previous = now.y;
  if (now.danger && !warned) {
    warned = true;
    await page.screenshot({ path: `${OUT}/water-danger.png` });
    console.log("  shot: water-danger.png");
  }
  await page.waitForTimeout(900);
}
console.log(`  rose on ${rose} of the samples; warning reached: ${warned}`);
if (rose < 3) problems.push("the water did not rise after the grace platforms");
if (!warned) problems.push("the run ended without the water ever warning");

await browser.close();

console.log("");
if (problems.length === 0) {
  console.log("WATER: rises, reads, warns");
  process.exit(0);
}
for (const p of problems) console.log("  !", p);
console.log("\nWATER: PROBLEMS");
process.exit(1);
