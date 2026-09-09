import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(800);

const ch = await page.evaluate(() => document.querySelector(".caret")?.parentElement?.textContent);
// Hold the key down: Playwright's down() triggers OS-level auto-repeat.
await page.keyboard.down(ch);
await page.waitForTimeout(900);
await page.keyboard.up(ch);
await page.waitForTimeout(300);

const state = await page.evaluate(() => ({
  correct: document.querySelectorAll('.type-surface span[data-state="correct"]').length,
  wrong: document.querySelectorAll('.type-surface span[data-state="wrong"]').length,
  hud: Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent?.trim()),
}));
console.log("after holding one key for 900ms:", JSON.stringify(state));
console.log(state.correct <= 1 ? "REPEAT BLOCKED" : `REPEAT LEAKED (${state.correct} chars)`);
await browser.close();
