import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
// Climb a little so the climber is on a real word platform.
for (let i = 0; i < 4; i++) {
  const w = await page.evaluate(() => document.querySelector('.platform[data-rank="0"] .platform-word')?.textContent);
  if (!w) break;
  for (const ch of w) { await page.keyboard.type(ch); await page.waitForTimeout(40); }
  await page.waitForTimeout(150);
}
await page.waitForTimeout(400);
const geo = await page.evaluate(() => {
  const root = document.querySelector('.platform[data-rank="0"]');
  const slab = document.querySelector('.platform[data-rank="0"] .platform-slab');
  const climber = document.querySelector(".climber");
  const r = (el) => {
    const b = el?.getBoundingClientRect();
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.x + b.width / 2), bottom: Math.round(b.bottom) };
  };
  return {
    platformRoot: r(root),
    slab: r(slab),
    ledge: r(document.querySelector(".ledge .platform-slab")),
    climber: r(climber),
    climberTransform: climber?.style.transform,
    platformTransform: root?.style.transform,
    climberCss: climber && {
      width: getComputedStyle(climber).width,
      height: getComputedStyle(climber).height,
      translate: getComputedStyle(climber).translate,
    },
  };
});
console.log(JSON.stringify(geo, null, 1));
console.log("x offset:", geo.slab.cx - geo.climber.cx, "px");
console.log("feet vs LEDGE top:", geo.climber.bottom - geo.ledge.y, "px (0 = standing on it)");
console.log("climber bottom vs active slab bottom:", geo.climber.bottom - geo.slab.bottom, "px (>0 = below the word, good)");
await browser.close();
