import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
const buttons = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).map((b) => ({
    text: b.textContent?.trim(),
    label: b.getAttribute("aria-label"),
  })),
);
console.log("buttons:", JSON.stringify(buttons, null, 1));
console.log("theme attr:", await page.evaluate(() => document.documentElement.dataset.theme));
console.log("prefers light:", await page.evaluate(() => matchMedia("(prefers-color-scheme: light)").matches));
await browser.close();
