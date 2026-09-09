/**
 * Captures the README screenshots from the running dev server.
 *
 * Real captures rather than mockups: a screenshot in a README is a claim
 * about what the software does.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  colorScheme: "dark",
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

// Let a wave build, then play into it so the shot shows a real board with a
// locked target and a live combo rather than an empty field.
await page.waitForTimeout(5500);

const live = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".transmission"))
      .filter((n) => n.style.opacity !== "0" && !n.style.transform.includes("-9999"))
      .map((n) => n.textContent ?? ""),
  );

for (let round = 0; round < 3; round++) {
  const words = await live();
  if (words.length === 0) break;
  for (const ch of words[0]) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(200);
}

// Stop partway through the next word, so the lock indicator is visible.
const words = await live();
if (words.length > 0) {
  for (const ch of words[0].slice(0, Math.max(1, words[0].length - 2))) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
}
await page.waitForTimeout(250);
await page.screenshot({ path: "docs/onslaught.png" });
console.log("docs/onslaught.png");

// Sprint, mid-run and then complete.
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "15s", exact: true }).click();
await page.waitForTimeout(800);

/**
 * Reads the character the game is currently waiting for.
 *
 * Typing from a list read up front looks fine until the run pauses -- which
 * it does whenever the headless browser loses focus, correctly, to protect
 * the clock. Keystrokes during a pause are discarded, so a script tracking
 * its own index desynchronises and the capture shows a run full of errors
 * that never happened. Reading the caret each time is what a human does.
 */
const expected = () =>
  page.evaluate(() => document.querySelector(".caret")?.parentElement?.textContent ?? null);

const paused = () =>
  page.evaluate(() => document.body.textContent?.includes("The clock is stopped") ?? false);

let typed = 0;
let sprintShot = false;
const t0 = Date.now();

while (Date.now() - t0 < 19_000) {
  if (await paused()) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    continue;
  }

  const ch = await expected();
  if (ch === null) break; // the run is over

  // Two deliberate errors, so the analysis has something real to report.
  const wrong = (typed === 40 || typed === 95) && ch !== " ";
  await page.keyboard.type(wrong ? "q" : ch);
  typed++;

  if (!sprintShot && Date.now() - t0 > 6500) {
    await page.screenshot({ path: "docs/sprint.png" });
    console.log("docs/sprint.png");
    sprintShot = true;
  }
  await page.waitForTimeout(62);
}

// The analysis, once the clock has run out. Waiting for the DOM rather than
// a fixed delay: a timeout races the clock and captures the run instead.
await page.getByRole("button", { name: "Again", exact: true }).waitFor({ timeout: 25_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: "docs/analysis.png" });
console.log("docs/analysis.png");

await page.evaluate(() => document.querySelector(".overflow-y-auto")?.scrollBy(0, 1500));
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/analysis-keys.png" });
console.log("docs/analysis-keys.png");

// Light theme, for the README's theme note.
await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector(".overflow-y-auto")?.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/analysis-light.png" });
console.log("docs/analysis-light.png");

await browser.close();
