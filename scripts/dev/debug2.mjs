import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(900);

const spans = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".type-surface > span")).slice(0, 6).map((s) => JSON.stringify(s.textContent)),
);
console.log("spans:", spans.join(" "));

const text = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".type-surface > span")).slice(0, 6).map((s) => s.textContent).join(""),
);
console.log("typing:", JSON.stringify(text));

for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(50); }
await page.waitForTimeout(300);

const state = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll(".type-surface > span"));
  return {
    rendered: spans.slice(0, 8).map((s) => s.textContent),
    states: spans.slice(0, 2).map((s) =>
      Array.from(s.querySelectorAll("span[data-state]")).map((c) => `${c.textContent}:${c.dataset.state}`)),
  };
});
console.log("rendered:", JSON.stringify(state.rendered));
console.log("char states word0:", JSON.stringify(state.states[0]));
console.log("char states word1:", JSON.stringify(state.states[1]));
console.log("hud:", await page.evaluate(() =>
  Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent?.trim())));
await browser.close();
