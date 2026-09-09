/**
 * Captures the README screenshots from the running dev server.
 *
 * Real captures rather than mockups: a screenshot in a README is a claim
 * about what the software does.
 */
import { chromium } from "playwright";
import { activeWord, climb, waitForResults } from "./lib/climb.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  colorScheme: "dark",
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);

// Climb a few platforms so the shot shows a real board -- a combo running,
// the flood risen, and a word part-typed -- rather than the opening state.

await climb(page, 5, 55);

// Two deliberate mistakes, so the analysis screen has something real to say
// rather than a clean run's empty panels.
for (const wrong of ["q", "z"]) {
  const word = await activeWord(page);
  if (!word) break;
  await page.keyboard.type(wrong);
  await page.waitForTimeout(120);
  await page.keyboard.type(word, { delay: 55 });
  await page.waitForTimeout(300);
}

// Stop partway through the next word, so the shot shows the crouch loaded and
// the typed prefix lit.
const partial = await activeWord(page);
if (partial && partial.length > 2) {
  for (const ch of partial.slice(0, partial.length - 1)) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
}
await page.waitForTimeout(200);
await page.screenshot({ path: "docs/ascent.png" });
console.log("docs/ascent.png");

// The analysis. Reached by letting the water win rather than by running a
// clock down, because there is no clock -- and the two deliberate mistakes
// above are what give the analysis something real to report.
//
// Climbing on and then stopping is the honest way to end a run, and it is
// also the fastest: the gap closes in about fourteen seconds once the grace
// platforms are behind you.
await waitForResults(page);
await page.screenshot({ path: "docs/analysis.png" });
console.log("docs/analysis.png");

// The diagnosis half of the dashboard. It no longer needs scrolling to reach
// -- the whole analysis is one screen -- so this opens the per-second table
// instead, which is the part that is genuinely hidden.
await page.evaluate(() => {
  const details = Array.from(document.querySelectorAll("details")).find((d) =>
    d.querySelector("caption")?.textContent?.includes("each second"),
  );
  details?.setAttribute("open", "");
});
await page.waitForTimeout(500);
await page.screenshot({ path: "docs/analysis-keys.png" });
console.log("docs/analysis-keys.png");

// Light theme, for the README's theme note.
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/analysis-light.png" });
console.log("docs/analysis-light.png");

await browser.close();
