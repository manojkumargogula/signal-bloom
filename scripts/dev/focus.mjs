/**
 * Reproduces the "nothing gets typed" failure and proves it is fixed.
 *
 * The hidden capture input is focused once on mount, and the text channel only
 * fires while it holds focus. Anything that steals focus first -- a browser
 * notification bar, an extension, a click on the address bar -- left the game
 * permanently unresponsive with no symptom beyond nothing happening.
 *
 * Every earlier test missed this because Playwright's keyboard always targets
 * the focused element, and in those tests that was the input.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  colorScheme: "dark",
});
page.on("pageerror", (e) => errors.push(e.message));

const focused = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}${el.className ? "." + String(el.className).split(" ")[0] : ""}` : "none";
  });

const words = () =>
  page.evaluate(
    () =>
      Array.from(document.querySelectorAll(".num"))
        .slice(0, 2)
        .map((n) => n.textContent?.trim()) ?? [],
  );

async function check(label, steal) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sprint", exact: true }).click();
  await page.waitForTimeout(700);

  await steal();
  const before = await focused();

  // Type the character the game is waiting for.
  const ch = await page.evaluate(
    () => document.querySelector(".caret")?.parentElement?.textContent ?? null,
  );
  if (ch === null) {
    console.log(`  ${label}: no caret found`);
    return false;
  }
  await page.keyboard.type(ch);
  await page.waitForTimeout(200);

  const after = await focused();
  const typed = await page.evaluate(
    () => document.querySelectorAll('.type-surface span[data-state="correct"]').length,
  );

  console.log(
    `  ${label}: focus ${before} -> ${after}, characters registered: ${typed}`,
  );
  return typed > 0;
}

const results = [];

// 1. The normal case, as a control.
results.push([
  "focused on load",
  await check("focused on load", async () => {}),
]);

// 2. Focus stolen by another element, which is what a notification bar or an
//    extension does.
results.push([
  "focus stolen by another element",
  await check("focus stolen by another element", async () => {
    await page.evaluate(() => {
      const thief = document.createElement("input");
      thief.id = "thief";
      thief.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.append(thief);
      thief.focus();
    });
  }),
]);

// 3. Focus dropped to the document body entirely.
results.push([
  "focus dropped to body",
  await check("focus dropped to body", async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  }),
]);

// 4. Recovery by clicking the board, which is what a player would try.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(700);
await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
await page.mouse.click(640, 500);
await page.waitForTimeout(150);
const afterClick = await focused();
console.log(`  click on the board restores focus: ${afterClick}`);
results.push(["click restores focus", afterClick.startsWith("INPUT")]);

console.log(`\nwords readout on the last run: ${JSON.stringify(await words())}`);
console.log(`page errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  !", e);

await browser.close();

const failed = results.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.log(`\nFOCUS: FAILED -> ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log("\nFOCUS: typing works from every starting state");
