/**
 * Plays two runs back to back and checks the history panel.
 *
 * History is written at the end of a run and read on the results screen, so
 * the trend only exists once a second run has finished -- far enough in that
 * it is easy to ship broken. It also only exists if both runs are counted:
 * personal bests and the trend line are keyed on the mode alone now, and the
 * earlier version keyed them on run length too, which with an untimed game
 * put every run in a bucket of its own and left the trend permanently empty.
 */
import { chromium } from "playwright";
import { climb, waitForResults } from "./lib/climb.mjs";

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
await page.waitForTimeout(1200);

/**
 * Plays a run and lets the water end it.
 *
 * Climbing a few platforms and then stopping, rather than typing until a
 * clock runs out: there is no clock. The two runs climb DIFFERENT heights on
 * purpose, so the trend has two distinct points to draw and a chart that
 * silently plots one value twice would show.
 */
async function playRun(label, platforms) {
  const cleared = await climb(page, platforms, 55);
  await waitForResults(page);
  const wpm = await page.evaluate(() => document.querySelector(".num")?.textContent?.trim());
  console.log(`  ${label}: ${cleared} platforms, ${wpm} WPM`);
  return wpm;
}

await playRun("run 1", 6);

const firstRunMessage = await page.evaluate(() => {
  const text = document.body.textContent ?? "";
  return text.includes("first recorded run") || text.includes("One run recorded");
});
console.log(`  after run 1, shows a first-run message: ${firstRunMessage}`);

await page.getByRole("button", { name: "Again", exact: true }).click();
await page.waitForTimeout(900);
await playRun("run 2", 10);

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
