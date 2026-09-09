/**
 * Drives Onslaught to a wave boundary and checks the relic draft.
 *
 * The draft is the roguelite mechanic the whole mode is built around, and it
 * only appears after a wave is cleared -- which is far enough in that it is
 * easy to ship untested.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const live = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".transmission"))
      .filter((n) => n.style.opacity !== "0" && !n.style.transform.includes("-9999"))
      .map((n) => ({ text: n.textContent ?? "", active: n.dataset.active === "true" })),
  );

const draftVisible = () =>
  page.evaluate(() => document.querySelector('[role="dialog"]') !== null);

const hud = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent?.trim()),
  );

// Clear the wave by decoding everything that appears, as fast as it arrives.
let decoded = 0;
const started = Date.now();

while (Date.now() - started < 110_000) {
  if (await draftVisible()) break;

  const field = await live();
  if (field.length === 0) {
    await page.waitForTimeout(120);
    continue;
  }

  // Always answer the transmission already locked, else the nearest.
  const target = field.find((f) => f.active) ?? field[0];
  const word = target.text;
  if (!word) { await page.waitForTimeout(80); continue; }

  for (const ch of word) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(28);
  }
  decoded++;
  if (decoded % 5 === 0) console.log(`  decoded ${decoded}, hud ${JSON.stringify(await hud())}`);
}

const reached = await draftVisible();
console.log(`\ndraft reached: ${reached} after ${decoded} decodes`);

if (!reached) {
  console.log("  FAILED to reach a wave boundary");
  console.log(`  hud: ${JSON.stringify(await hud())}`);
  await page.screenshot({ path: "/tmp/shots/draft-missing.png" });
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: "/tmp/shots/draft.png" });
console.log("  shot: /tmp/shots/draft.png");

const offers = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="dialog"] li button')).map((b) => ({
    name: b.querySelector("h3")?.textContent,
    rarity: b.querySelector("span")?.textContent,
    blurb: b.querySelector("p")?.textContent,
  })),
);
console.log(`  offers: ${JSON.stringify(offers, null, 1)}`);

// Pick with the keyboard, which is the point of the draft being keyboard-first.
await page.keyboard.press("1");
await page.waitForTimeout(600);

const dismissed = !(await draftVisible());
console.log(`  draft dismissed after pressing 1: ${dismissed}`);

const relicsHeld = await page.evaluate(() => window.__relics ?? null);
console.log(`  hud after pick: ${JSON.stringify(await hud())}`);
await page.screenshot({ path: "/tmp/shots/after-draft.png" });

// Confirm the game resumed and is spawning again.
await page.waitForTimeout(2500);
const resumed = (await live()).length;
console.log(`  transmissions after resume: ${resumed}`);
void relicsHeld;

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log("  !", e);
await browser.close();
if (!dismissed || resumed === 0) process.exit(1);
