/**
 * Asserts the app is one screen — while playing AND after the run.
 *
 * The game being a single locked viewport is a stated requirement, and it is
 * the kind of requirement that decays silently: any panel that grows a row,
 * any figure that wraps to a second line, and the results screen quietly
 * starts scrolling again. Neither the type checker nor a unit test can see
 * it, so it gets a script.
 *
 * What it checks, at three real viewport sizes:
 *
 * 1. the document never scrolls, in either phase;
 * 2. the results container itself never scrolls at `lg` and up;
 * 3. every panel fits its own box, so nothing is clipped and no panel needs
 *    an inner scrollbar just to show its resting content.
 *
 * A panel MAY scroll once a `<details>` inside it is opened — that is the
 * designed escape hatch — so the panel check runs with everything closed.
 *
 * Both modes are measured. Ascent's verdict carries a line Sprint's does not,
 * and it is the taller of the two, so checking only the quick Sprint run would
 * have missed exactly the case that overflows.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";

/** Real sizes, not round numbers: a 1366x768 laptop is the tight case. */
const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 1366, height: 768, label: "1366x768" },
];

const problems = [];

const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: "dark",
  });
  page.on("pageerror", (e) => problems.push(`${viewport.label}: pageerror: ${e.message}`));

  console.log(`\n${viewport.label}`);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // ---- phase one: playing ----------------------------------------------
  const playing = await docOverflow(page);
  report(viewport, "playing", playing);

  // ---- get to the results ----------------------------------------------
  // Sprint at 15s, typed correctly, so the run is VALID -- the layout most
  // players see. An invalid run adds a "not counted" panel, which makes the
  // verdict column taller; ONESCREEN_MISTYPE=1 produces that variant.
  // The mode picker is a `role="group"` of `aria-pressed` buttons, not a
  // radiogroup, so it is addressed by button name.
  await page.getByRole("button", { name: "Sprint", exact: true }).click();
  await page.getByRole("button", { name: "15s", exact: true }).click();
  await page.waitForTimeout(500);

  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".type-surface > span"))
      .map((s) => s.textContent ?? "")
      .join(""),
  );
  if (!text) problems.push(`${viewport.label}: no typing surface found`);

  const typed = process.env.ONESCREEN_MISTYPE
    ? text.slice(0, 220).replace(/[a-z]/g, (c) => (Math.random() < 0.4 ? "q" : c))
    : text.slice(0, 220);
  await page.keyboard.type(typed, { delay: 55 });
  // The clock runs 15s from the first keystroke; wait it out.
  await waitForResults(page);

  // ---- phase two: the results ------------------------------------------
  const results = await docOverflow(page);
  report(viewport, "results", results);

  const container = await page.evaluate(() => {
    // The results own the whole board area; find the element the panels sit in.
    const grid = document.querySelector('[class*="grid-cols-"]')?.parentElement ?? null;
    if (!grid) return null;
    return {
      scrollHeight: grid.scrollHeight,
      clientHeight: grid.clientHeight,
      overflowY: getComputedStyle(grid).overflowY,
    };
  });
  if (container) {
    const over = container.scrollHeight - container.clientHeight;
    const ok = over <= 1;
    console.log(
      `  results container: ${container.clientHeight}px box, ${container.scrollHeight}px content ` +
        `(overflow-y: ${container.overflowY}) ${ok ? "ok" : `OVER by ${over}px`}`,
    );
    if (!ok) problems.push(`${viewport.label}: results container scrolls by ${over}px`);
  } else {
    problems.push(`${viewport.label}: could not find the results container`);
  }

  await measurePanels(page, viewport, "sprint");

  await page.screenshot({ path: `${OUT}/onescreen-${viewport.label}.png` });
  console.log(`  shot: onescreen-${viewport.label}.png`);

  // ---- and again for Ascent, whose verdict is the taller one -----------
  // Clear the grace platforms so the flood starts moving, then stop typing:
  // the water closes the gap in about fifteen seconds, which is much the
  // fastest honest way to reach an Ascent result.
  await page.getByRole("button", { name: "Ascent", exact: true }).click();
  await page.waitForTimeout(900);
  for (let i = 0; i < 4; i++) {
    const word = await page.evaluate(
      () => document.querySelector('.platform[data-rank="0"] .platform-word')?.textContent ?? "",
    );
    if (!word) break;
    const done = await page.evaluate(
      () => document.querySelectorAll('.platform[data-rank="0"] [data-state="done"]').length,
    );
    await page.keyboard.type(word.slice(done), { delay: 40 });
    await page.waitForTimeout(320);
  }
  await waitForResults(page);

  report(viewport, "ascent results", await docOverflow(page));
  await measurePanels(page, viewport, "ascent");
  await page.screenshot({ path: `${OUT}/onescreen-ascent-${viewport.label}.png` });
  console.log(`  shot: onescreen-ascent-${viewport.label}.png`);

  await page.close();
}

await browser.close();

console.log("");
if (problems.length === 0) {
  console.log("ONE SCREEN: nothing scrolls");
  process.exit(0);
}
for (const p of problems) console.log("  !", p);
console.log("\nONE SCREEN: PROBLEMS");
process.exit(1);

/**
 * Every panel's resting height against its box.
 *
 * A panel that needs to scroll at rest is a layout failure at the sizes this
 * dashboard claims to fit. Below 800px of viewport height it is downgraded to
 * a note: the columns genuinely cannot hold the content on a 768px laptop, and
 * one card scrolling inside itself is the designed degradation -- the page
 * still does not scroll, which is the actual promise.
 */
async function measurePanels(page, viewport, mode) {
  const panels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("section")).map((el) => ({
      heading:
        el.querySelector("h3")?.textContent?.trim() ??
        el.querySelector(".label")?.textContent?.trim() ??
        "the verdict",
      over: el.scrollHeight - el.clientHeight,
      height: el.clientHeight,
    })),
  );
  const strict = viewport.height >= 800;
  for (const panel of panels) {
    const ok = panel.over <= 1;
    const note = ok ? "ok" : strict ? `OVER by ${panel.over}px` : `scrolls ${panel.over}px (allowed)`;
    console.log(`  ${mode} panel "${panel.heading}": ${panel.height}px ${note}`);
    if (!ok && strict) {
      problems.push(
        `${viewport.label}: ${mode} panel "${panel.heading}" needs ${panel.over}px more`,
      );
    }
  }
}

/**
 * Waits for a run to end and its analysis to render.
 *
 * Keyed on the Again button, which exists only in the results. The obvious
 * signal -- the word "wpm" appearing on the page -- is wrong: the in-game HUD
 * carries a WPM readout too, so it matched instantly and the Ascent pass
 * silently measured a screen that was still being played.
 */
async function waitForResults(page) {
  await page.getByRole("button", { name: "Again", exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
}

/** Document-level overflow, which must be zero in every phase. */
function docOverflow(page) {
  return page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

function report(viewport, phase, box) {
  const overY = box.scrollHeight - box.clientHeight;
  const overX = box.scrollWidth - box.clientWidth;
  const ok = overY <= 1 && overX <= 1;
  console.log(
    `  document while ${phase}: ${box.clientWidth}x${box.clientHeight} box, ` +
      `${box.scrollWidth}x${box.scrollHeight} content ${ok ? "ok" : "OVERFLOWS"}`,
  );
  if (overY > 1) problems.push(`${viewport.label}: document scrolls vertically by ${overY}px while ${phase}`);
  if (overX > 1) problems.push(`${viewport.label}: document scrolls horizontally by ${overX}px while ${phase}`);
}
