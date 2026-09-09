import { chromium } from "playwright";

const measure = (page, label) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const f = [];
        let last = performance.now();
        let i = 0;
        const tick = (now) => {
          f.push(now - last);
          last = now;
          if (++i < n) requestAnimationFrame(tick);
          else {
            const s = f.slice(3).sort((a, b) => a - b);
            resolve({
              median: s[(s.length / 2) | 0],
              p95: s[(s.length * 0.95) | 0],
              worst: s[s.length - 1],
              over20: s.filter((x) => x > 20).length,
              n: s.length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    240,
  ).then((r) => {
    console.log(
      `  ${label.padEnd(24)} median ${r.median.toFixed(1)}ms  p95 ${r.p95.toFixed(1)}ms  worst ${r.worst.toFixed(1)}ms  frames>20ms ${r.over20}/${r.n}`,
    );
    return r;
  });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(6000); // let the field fill

console.log("as shipped:");
await measure(page, "everything on");

console.log("\nisolating layers:");
await page.evaluate(() => {
  const el = document.querySelector(".scanlines");
  el?.classList.remove("scanlines");
});
await page.waitForTimeout(400);
await measure(page, "no scanlines");

await page.evaluate(() => {
  document.querySelector(".vignette")?.classList.remove("vignette");
});
await page.waitForTimeout(400);
await measure(page, "no scanlines/vignette");

await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (c) c.style.display = "none";
});
await page.waitForTimeout(400);
await measure(page, "shader hidden too");

await browser.close();
