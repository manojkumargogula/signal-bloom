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
 * 1. the surface undulates rather than being a straight line, read off the
 *    pixels the browser painted;
 * 2. its crest is lit against the water below it, which is the cue that makes
 *    a coloured area read as wet;
 * 3. the wave trains move INDEPENDENTLY -- a rigid translation is the exact
 *    failure the canvas replaced, and it would pass a naive "did it move";
 * 4. the level rises once the grace platforms are cleared;
 * 5. the warning state arrives before the run ends;
 * 6. and it paints every band's palette at the same waterline, because
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

// ---- the water is a drawn surface, not a flat fill ---------------------
// Everything here is read off the pixels the browser actually painted. The
// water moved from five masked divs to a canvas precisely because a shape
// translating at a constant speed is a conveyor belt rather than a liquid, so
// what has to be asserted is that the surface UNDULATES and that its crest is
// lit -- neither of which any DOM assertion can see.
function probe(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.water");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const scale = canvas.width / canvas.clientWidth;
    const columns = [];
    // Twenty columns across the width, which spans several wavelengths of
    // even the longest wave train.
    for (let i = 1; i <= 20; i++) {
      const x = Math.floor((canvas.width * i) / 21);
      const strip = ctx.getImageData(x, 0, 1, canvas.height).data;
      let top = null;
      for (let y = 0; y < canvas.height; y++) {
        if (strip[y * 4 + 3] > 24) {
          top = y;
          break;
        }
      }
      if (top === null) {
        columns.push(null);
        continue;
      }
      const at = (y) => {
        const o = Math.min(canvas.height - 1, y) * 4;
        return 0.2126 * strip[o] + 0.7152 * strip[o + 1] + 0.0722 * strip[o + 2];
      };
      columns.push({
        surface: top / scale,
        crest: at(top + 1),
        // Well below the crest and below the sheen band, so this is the body.
        deep: at(top + Math.round(70 * scale)),
      });
    }
    return { width: canvas.width, height: canvas.height, columns };
  });
}

const expect = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

{
  const first = await probe(page);
  if (!first) {
    problems.push("no water canvas in the field at all");
  } else {
    expect(first.width > 0 && first.height > 0, "the water canvas is sized to the field");
    const found = first.columns.filter(Boolean);
    expect(found.length === first.columns.length, "the water spans the full width");

    const tops = found.map((c) => c.surface);
    const spread = Math.max(...tops) - Math.min(...tops);
    console.log(`       surface varies by ${spread.toFixed(1)}px across the width`);
    expect(spread > 3, "the surface undulates rather than being a straight line");

    const lit = found.filter((c) => c.crest > c.deep + 8).length;
    console.log(`       crest brighter than the body in ${lit}/${found.length} columns`);
    expect(lit > found.length * 0.6, "the crest is lit against the water below it");
  }
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

/**
 * The waterline.
 *
 * Averaged across the probe's columns rather than read from a style, because
 * the level is no longer a transform on a box -- it is where the canvas drew
 * the surface, and the waves mean any single column is a few pixels off.
 */
async function level(page) {
  const now = await probe(page);
  if (!now) return null;
  const found = now.columns.filter(Boolean);
  if (found.length === 0) return null;
  const danger = await page.evaluate(
    () => document.querySelector("canvas.water")?.dataset.danger === "true",
  );
  return {
    y: found.reduce((sum, c) => sum + c.surface, 0) / found.length,
    danger,
  };
}

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
    // The canvas reads `--water` on a band change or a resize, and this is
    // neither, so nudge it.
    window.dispatchEvent(new Event("resize"));
  }, band);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/water-${band.id}.png` });
  console.log(`  shot: water-${band.id}.png`);
}

// ---- the surface moves through itself ----------------------------------
// Two probes a beat apart at a moment when the LEVEL is barely changing. The
// old CSS version would pass a "did the pattern move" check too, so what is
// checked is that the columns did not all move by the SAME amount: a rigid
// translation is the failure mode being ruled out.
{
  const a = await probe(page);
  await page.waitForTimeout(700);
  const b = await probe(page);
  if (a && b) {
    const deltas = a.columns
      .map((c, i) => (c && b.columns[i] ? b.columns[i].surface - c.surface : null))
      .filter((d) => d !== null);
    const spread = Math.max(...deltas) - Math.min(...deltas);
    console.log(`       columns moved over a range of ${spread.toFixed(1)}px`);
    expect(spread > 1.5, "the wave trains move independently, not as one rigid shape");
  }
}

// ---- it rises, and it warns before it kills ----------------------------
let previous = Infinity;
let rose = 0;
let warned = false;
for (let i = 0; i < 20; i++) {
  const now = await level(page);
  if (!now) break;
  // Two pixels, not half of one: the waves alone move a column by several,
  // so a smaller threshold would count swell as a rising level.
  if (now.y < previous - 2) rose++;
  previous = now.y;
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
