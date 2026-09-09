/**
 * Plays two Sprint runs back to back and checks the history panel.
 *
 * History is written at the end of a run and read on the results screen, so
 * the trend only exists once a second run has finished -- far enough in that
 * it is easy to ship broken.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  colorScheme: "dark",
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sprint", exact: true }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "15s", exact: true }).click();
await page.waitForTimeout(700);

// Read the character the game is waiting for, rather than replaying a list:
// a run that auto-pauses discards keystrokes, and a script tracking its own
// index would desynchronise.
const expected = () =>
  page.evaluate(() => document.querySelector(".caret")?.parentElement?.textContent ?? null);

const paused = () =>
  page.evaluate(() => document.body.textContent?.includes("The clock is stopped") ?? false);

async function playRun(label) {
  const started = Date.now();
  while (Date.now() - started < 19_000) {
    if (await paused()) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      continue;
    }
    const ch = await expected();
    if (ch === null) break;
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
  await page.getByRole("button", { name: "Again", exact: true }).waitFor({ timeout: 25_000 });
  const wpm = await page.evaluate(() => document.querySelector(".num")?.textContent?.trim());
  console.log(`  ${label}: ${wpm} WPM`);
  return wpm;
}

await playRun("run 1");

const firstRunMessage = await page.evaluate(() => {
  const text = document.body.textContent ?? "";
  return text.includes("first recorded run") || text.includes("One run recorded");
});
console.log(`  after run 1, shows a first-run message: ${firstRunMessage}`);

await page.getByRole("button", { name: "Again", exact: true }).click();
await page.waitForTimeout(900);
await playRun("run 2");

const trend = await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("h3")).find((h) =>
    h.textContent?.includes("last"),
  );
  const figure = heading?.closest("figure");
  return {
    heading: heading?.textContent?.trim() ?? null,
    points: figure?.querySelector("svg polyline")?.getAttribute("points")?.split(" ").length ?? 0,
    delta: figure?.querySelector(".num")?.textContent?.trim() ?? null,
  };
});
console.log(`  trend: ${JSON.stringify(trend)}`);

// The table view, which is how the data stays reachable without the chart.
const rows = await page.evaluate(() => {
  const details = Array.from(document.querySelectorAll("details")).find((d) =>
    d.querySelector("caption")?.textContent?.includes("recorded runs"),
  );
  if (!details) return null;
  details.setAttribute("open", "");
  return Array.from(details.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim()),
  );
});
console.log(`  table rows: ${JSON.stringify(rows)}`);

await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("h3")).find((h) =>
    h.textContent?.includes("last"),
  );
  heading?.closest("section")?.scrollIntoView();
});
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/shots/history.png" });

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 6)) console.log("  !", e);
await browser.close();

const ok = trend.points >= 2 && Array.isArray(rows) && rows.length >= 2;
console.log(ok ? "HISTORY: verified" : "HISTORY: FAILED");
process.exit(ok ? 0 : 1);
