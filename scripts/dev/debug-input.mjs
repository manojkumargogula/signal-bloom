import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto("http://localhost:3001/play/sprint/", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

console.log("focused:", await page.evaluate(() => {
  const el = document.activeElement;
  return el ? `${el.tagName}.${el.className}` : "none";
}));

const targets = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".type-surface > span")).slice(0, 3).map((s) => s.textContent),
);
console.log("targets:", JSON.stringify(targets));

// Instrument beforeinput to see what actually reaches the input.
await page.evaluate(() => {
  window.__seen = [];
  const input = document.querySelector('input[aria-label="Typing input"]');
  input?.addEventListener("beforeinput", (e) => {
    window.__seen.push({ type: e.inputType, data: e.data });
  }, true);
  window.addEventListener("keydown", (e) => {
    window.__seen.push({ kd: e.key, code: e.code });
  }, true);
});

const text = (targets[0] ?? "") + (targets[1] ?? "");
console.log("typing:", JSON.stringify(text));
for (const ch of text) {
  await page.keyboard.type(ch);
  await page.waitForTimeout(45);
}
await page.waitForTimeout(400);

const seen = await page.evaluate(() => window.__seen);
console.log("events:", JSON.stringify(seen));
console.log("surface now:", await page.evaluate(() => {
  const s = document.querySelectorAll(".type-surface > span");
  return Array.from(s).slice(0, 3).map((x) => x.textContent);
}));
console.log("hud:", await page.evaluate(() =>
  Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent)));
await browser.close();
