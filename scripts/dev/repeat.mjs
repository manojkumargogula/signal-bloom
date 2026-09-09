/**
 * Holds one key down and asserts exactly one character lands.
 *
 * `event.repeat` was never checked, so holding a key registered about thirty
 * keystrokes a second: inflated raw WPM, and per-key latency and heatmap
 * statistics poisoned by intervals no human produced.
 */
import { chromium } from "playwright";
import { activeWord, nextChar, typedCount } from "./lib/climb.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// A multi-letter word, so a leaked repeat has somewhere to go. The opening
// platforms are single letters and would clear on the first press whatever
// happened next.
while ((await activeWord(page))?.length === 1) {
  const word = await activeWord(page);
  await page.keyboard.type(word);
  await page.waitForTimeout(250);
}

const ch = await nextChar(page);
const word = await activeWord(page);
// Playwright's down() triggers OS-level auto-repeat.
await page.keyboard.down(ch);
await page.waitForTimeout(900);
await page.keyboard.up(ch);
await page.waitForTimeout(300);

const typed = await typedCount(page);
console.log(`held "${ch}" of "${word}" for 900ms: ${typed} letter(s) accepted`);
console.log(typed <= 1 ? "REPEAT BLOCKED" : `REPEAT LEAKED (${typed} chars)`);
await browser.close();
process.exit(typed <= 1 ? 0 : 1);
