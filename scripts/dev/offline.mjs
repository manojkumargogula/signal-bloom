/**
 * Proves the offline claim.
 *
 * The README and the FAQ both say Signal Bloom plays offline once loaded.
 * That is a public factual claim, so it gets tested rather than asserted:
 * load the page, let the worker install, cut the network, reload, and play.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: "dark",
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

const controlled = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return "no registration";
  for (let i = 0; i < 80 && !navigator.serviceWorker.controller; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return navigator.serviceWorker.controller ? "controlled" : "registered, not controlling";
});
console.log(`service worker: ${controlled}`);

await page.waitForTimeout(2500);

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const name of names) {
    const cache = await caches.open(name);
    out[name] = (await cache.keys()).length;
  }
  return out;
});
console.log(`caches: ${JSON.stringify(cached)}`);

// Cut the network entirely and reload.
await context.setOffline(true);
console.log("network: offline");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const heading = await page.locator("h1").first().innerText().catch(() => null);
console.log(`heading offline: ${heading ? heading.split("\\n")[0] : "MISSING"}`);

// The real test: can it be played?
await page.waitForTimeout(3500);
const field = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".transmission"))
    .filter((n) => n.style.opacity !== "0" && !n.style.transform.includes("-9999"))
    .map((n) => n.textContent ?? ""),
);
console.log(`transmissions offline: ${field.length} -> ${JSON.stringify(field.slice(0, 3))}`);

let played = false;
if (field.length > 0 && field[0]) {
  for (const ch of field[0]) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(300);
  const hud = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".num")).slice(0, 4).map((n) => n.textContent?.trim()),
  );
  console.log(`hud after decoding offline: ${JSON.stringify(hud)}`);
  played = Number(hud[1]) > 0;
}

// And the content pages, which are precached too.
await page.goto(`${BASE}/metrics/`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(800);
const metricsHeading = await page.locator("h1").first().innerText().catch(() => null);
console.log(`/metrics/ offline: ${metricsHeading ? "loaded" : "MISSING"}`);

await page.screenshot({ path: "/tmp/shots/offline.png" });
console.log(`\npage errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  !", e);

await browser.close();

const ok = controlled === "controlled" && Boolean(heading) && played && Boolean(metricsHeading);
console.log(ok ? "\nOFFLINE: verified playable" : "\nOFFLINE: FAILED");
process.exit(ok ? 0 : 1);
