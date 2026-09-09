import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "120s", exact: true }).click();
await page.waitForTimeout(800);

const targets = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".type-surface > span")).map((s) => s.textContent ?? ""),
);
console.log("spans rendered:", targets.length);

const text = targets.join("");
for (let i = 0; i < text.length; i++) {
  await page.keyboard.type(text[i]);
  await page.waitForTimeout(45);
  if (i === 60 || i === 140 || i === text.length - 1) {
    const st = await page.evaluate(() => ({
      hud: Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent?.trim()),
      wordIndex: window.__dbgWordIndex,
    }));
    console.log(`after ${i + 1} chars:`, JSON.stringify(st.hud));
  }
}

// Compare what the engine expected against what was typed.
const mismatch = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll(".type-surface > span"));
  const bad = [];
  for (const w of spans) {
    for (const c of Array.from(w.querySelectorAll("span[data-state]"))) {
      if (c.dataset.state === "wrong") bad.push(c.textContent);
    }
  }
  return bad.slice(0, 20);
});
console.log("wrong chars still visible:", JSON.stringify(mismatch));
await browser.close();
