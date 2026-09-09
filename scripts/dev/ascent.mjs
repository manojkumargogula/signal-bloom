/**
 * Plays Ascent in a real browser.
 *
 * Every serious bug in this project was found by driving the actual thing
 * rather than by a test, so the mode gets its own script: climb real
 * platforms, mistype on purpose, and cross a band boundary to reach the
 * relic draft.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot: ${name}`);
};

/** The word on the active platform, read straight out of the DOM. */
const activeWord = () =>
  page.evaluate(
    () =>
      document.querySelector('.platform[data-rank="0"] .platform-word')?.textContent ?? null,
  );

/** How much of it is already typed. */
const typedCount = () =>
  page.evaluate(
    () => document.querySelectorAll('.platform[data-rank="0"] [data-state="done"]').length,
  );

const hud = () =>
  page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".label")).map((l) =>
      l.textContent?.trim(),
    );
    const values = Array.from(document.querySelectorAll(".num")).map((n) =>
      n.textContent?.trim(),
    );
    return Object.fromEntries(labels.map((l, i) => [l, values[i]]));
  });

/**
 * The climber's crouch, as its body scale.
 *
 * Not its screen position: that is deliberately fixed, because the camera
 * anchors the active platform and moves instead of the climber. The
 * per-keystroke response lives entirely in the body's vertical scale, so
 * that is what has to be measured.
 */
const crouch = () =>
  page.evaluate(() => {
    const body = document.querySelector(".climber-body");
    if (!body) return null;
    const m = /scale\(([-\d.]+),\s*([-\d.]+)\)/.exec(body.style.transform);
    return m ? Number(m[2]) : null;
  });

const draftOpen = () => page.evaluate(() => document.querySelector('[role="dialog"]') !== null);

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
await shot("a1-ascent-open");

// ---- the platforms are there and legible -------------------------------
const stack = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".platform"))
    .filter((n) => n.style.opacity !== "0")
    .map((n) => ({
      rank: n.dataset.rank,
      word: n.querySelector(".platform-word")?.textContent,
    })),
);
console.log(`  visible platforms: ${JSON.stringify(stack)}`);

const first = await activeWord();
console.log(`  active word: ${JSON.stringify(first)}`);
console.log(`  hud: ${JSON.stringify(await hud())}`);

// ---- one correct letter must move the climber --------------------------
// The per-keystroke response is the single most important feel element in
// the mode, and the thing the reference's own redesign singled out.
const restCrouch = await crouch();
// A multi-letter word, so the crouch has somewhere to go. The opening
// platforms are single letters, which clear on the first keystroke.
while ((await activeWord())?.length === 1) {
  const w = await activeWord();
  await page.keyboard.type(w);
  await page.waitForTimeout(120);
}
const multi = await activeWord();
await page.keyboard.type(multi[0]);
await page.waitForTimeout(120);
const chargedCrouch = await crouch();
const typedOne = await typedCount();
const responded = typedOne === 1;
console.log(
  `  "${multi}" after one letter: typed ${typedOne}, ` +
    `crouch ${restCrouch?.toFixed(3)} -> ${chargedCrouch?.toFixed(3)}`,
);

// ---- climb -------------------------------------------------------------
let cleared = 0;
let mistyped = false;
let heartsBefore = null;
const started = Date.now();

while (Date.now() - started < 90_000 && !(await draftOpen())) {
  const word = await activeWord();
  if (!word) break;
  const done = await typedCount();
  const next = word[done];
  if (!next) break;

  // One deliberate mistake, to check it costs exactly one shield and does
  // not advance.
  if (!mistyped && cleared === 1) {
    heartsBefore = (await hud()).Clearance ?? null;
    const shieldsBefore = await page.evaluate(
      () => document.querySelectorAll('[aria-label*="shields"]')[0]?.getAttribute("aria-label"),
    );
    const typedBefore = await typedCount();
    await page.keyboard.type(next === "z" ? "q" : "z");
    await page.waitForTimeout(150);
    const typedAfter = await typedCount();
    const shieldsAfter = await page.evaluate(
      () => document.querySelectorAll('[aria-label*="shields"]')[0]?.getAttribute("aria-label"),
    );
    console.log(`  mistype: typed ${typedBefore} -> ${typedAfter} (must not advance)`);
    console.log(`  shields: ${shieldsBefore} -> ${shieldsAfter}`);
    await shot("a2-ascent-mistype");
    mistyped = true;
    continue;
  }

  await page.keyboard.type(next);
  await page.waitForTimeout(38);

  const nowDone = await typedCount();
  if (nowDone === 0 && done > 0) {
    cleared++;
    if (cleared === 2) await shot("a3-ascent-climbing");
  }
}

console.log(`  platforms cleared: ${cleared}`);
console.log(`  hud now: ${JSON.stringify(await hud())}`);
void heartsBefore;

// ---- the band boundary and the draft -----------------------------------
const reached = await draftOpen();
console.log(`  relic draft reached: ${reached}`);
if (reached) {
  await shot("a4-ascent-draft");
  const offers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"] li button')).map((b) => ({
      name: b.querySelector("h3")?.textContent,
      blurb: b.querySelector("p")?.textContent,
    })),
  );
  console.log(`  offers: ${JSON.stringify(offers.map((o) => o.name))}`);

  await page.keyboard.press("1");
  await page.waitForTimeout(600);
  console.log(`  draft dismissed: ${!(await draftOpen())}`);
  console.log(`  band after draft: ${(await hud()).Band}`);
  await shot("a5-ascent-after-draft");
}

// ---- frame timing ------------------------------------------------------
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const f = [];
      let last = performance.now();
      let n = 0;
      const tick = (now) => {
        f.push(now - last);
        last = now;
        if (++n < 150) requestAnimationFrame(tick);
        else {
          const s = f.slice(2).sort((a, b) => a - b);
          resolve({
            median: s[(s.length / 2) | 0],
            p95: s[(s.length * 0.95) | 0],
            over20: s.filter((x) => x > 20).length,
            n: s.length,
          });
        }
      };
      requestAnimationFrame(tick);
    }),
);
console.log(
  `  frames: median ${fps.median.toFixed(1)}ms  p95 ${fps.p95.toFixed(1)}ms  over 20ms ${fps.over20}/${fps.n}`,
);

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log("  !", e);

await browser.close();

const ok =
  Boolean(first) &&
  responded &&
  // The crouch must visibly answer a single keystroke. This is the feel
  // element the reference's own redesign singled out, so it is asserted.
  restCrouch !== null &&
  chargedCrouch !== null &&
  chargedCrouch < restCrouch &&
  cleared >= 3 &&
  errors.length === 0;
console.log(ok ? "\nASCENT: playable" : "\nASCENT: PROBLEMS");
process.exit(ok ? 0 : 1);
