import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";

const errors = [];
const browser = await chromium.launch();
// Headless Chromium reports prefers-color-scheme: light; dark is the primary
// theme, so force it.
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
});

page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot: ${name}`);
};

const hud = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".num")).slice(0, 6).map((n) => n.textContent?.trim()),
  );

// ---- onslaught (the default screen) --------------------------------------
console.log("onslaught");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await shot("01-onslaught-idle");

console.log(`  h1: ${(await page.locator("h1").first().innerText()).replace(/\n/g, " / ")}`);

// Let the field fill, then decode a real word.
await page.waitForTimeout(4200);
await shot("02-onslaught-field");

const field = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".transmission"))
    .filter((n) => n.style.opacity !== "0" && n.style.transform.indexOf("-9999") === -1)
    .map((n) => ({ text: n.textContent, rung: n.dataset.rung })),
);
console.log(`  live transmissions: ${field.length} -> ${JSON.stringify(field.slice(0, 4).map((f) => f.text))}`);

if (field.length > 0) {
  const word = field[0].text ?? "";
  for (const ch of word) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(120);
  await shot("03-onslaught-decoded");
  console.log(`  decoded "${word}" -> ${JSON.stringify(await hud())}`);
}

// Mid-word, to show the lock-on highlight.
await page.waitForTimeout(1600);
const field2 = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".transmission"))
    .filter((n) => n.style.opacity !== "0" && n.style.transform.indexOf("-9999") === -1)
    .map((n) => n.textContent),
);
if (field2.length > 0 && field2[0]) {
  for (const ch of field2[0].slice(0, Math.ceil(field2[0].length / 2))) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
  await shot("04-onslaught-locked");
}

// ---- frame timing --------------------------------------------------------
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const f = []; let last = performance.now(); let n = 0;
      const tick = (now) => {
        f.push(now - last); last = now;
        if (++n < 150) requestAnimationFrame(tick);
        else {
          const s = f.slice(2).sort((a, b) => a - b);
          resolve({ median: s[(s.length / 2) | 0], p95: s[(s.length * 0.95) | 0], worst: s[s.length - 1] });
        }
      };
      requestAnimationFrame(tick);
    }),
);
console.log(`  frames: median ${fps.median.toFixed(1)}ms · p95 ${fps.p95.toFixed(1)}ms · worst ${fps.worst.toFixed(1)}ms`);

// ---- sprint --------------------------------------------------------------
console.log("sprint");
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(1000);
await shot("05-sprint-idle");

const targets = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".type-surface > span")).slice(0, 26).map((s) => s.textContent ?? ""),
);
console.log(`  targets: ${JSON.stringify(targets.slice(0, 4))}`);

// Type most of it correctly, with two deliberate errors so the analysis has
// something real to report.
const text = targets.join("");
let i = 0;
const started = Date.now();
while (Date.now() - started < 12_500 && i < text.length) {
  // Inject a couple of realistic errors, but never in place of a space:
  // swallowing a word boundary desynchronises everything after it, which
  // measures the test script rather than the game.
  const wrong = (i === 30 || i === 61) && text[i] !== " ";
  await page.keyboard.type(wrong ? "q" : text[i]);
  i++;
  await page.waitForTimeout(58);
}
await page.waitForTimeout(300);
await shot("06-sprint-typing");
console.log(`  mid-run hud: ${JSON.stringify(await hud())}`);

// ---- light theme ---------------------------------------------------------
await page.getByRole("button", { name: /Switch to light theme/i }).click();
await page.waitForTimeout(500);
await shot("07-sprint-light");
console.log(`  theme: ${await page.evaluate(() => document.documentElement.dataset.theme)}`);
await page.getByRole("button", { name: /Switch to dark theme/i }).click();
await page.waitForTimeout(400);

// ---- results -------------------------------------------------------------
console.log("results");
await page.waitForTimeout(4000);
await shot("08-results");
const headline = await page.evaluate(() => {
  const el = document.querySelector(".num");
  return el?.textContent?.trim();
});
console.log(`  headline: ${headline}`);

await page.evaluate(() => {
  document.querySelector(".overflow-y-auto")?.scrollBy(0, 760);
});
await page.waitForTimeout(500);
await shot("09-results-chart");

await page.evaluate(() => {
  document.querySelector(".overflow-y-auto")?.scrollBy(0, 800);
});
await page.waitForTimeout(500);
await shot("10-results-keys");

// ---- zen -----------------------------------------------------------------
console.log("zen");
await page.getByRole("button", { name: "Zen", exact: true }).click();
await page.waitForTimeout(900);
await shot("11-zen");

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  !", e);
await browser.close();
