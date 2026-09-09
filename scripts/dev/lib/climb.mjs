/**
 * Shared helpers for driving the climb in a real browser.
 *
 * Every dev script used to reach for Sprint when it needed somewhere to type:
 * a fixed body of text with a caret is trivial to drive, and the script could
 * read the next expected character straight out of the DOM. With one untimed
 * game there is no such surface, so the same needs -- what should I type, and
 * how do I get to a results screen -- live here once instead of being
 * reinvented, subtly differently, in six files.
 */

/** The word on the active platform. */
export function activeWord(page) {
  return page.evaluate(
    () => document.querySelector('.platform[data-rank="0"] .platform-word')?.textContent ?? null,
  );
}

/** How much of it is already typed. */
export function typedCount(page) {
  return page.evaluate(
    () => document.querySelectorAll('.platform[data-rank="0"] [data-state="done"]').length,
  );
}

/** The single character the game is waiting for, or null if there is none. */
export async function nextChar(page) {
  const word = await activeWord(page);
  if (!word) return null;
  return word[await typedCount(page)] ?? null;
}

/**
 * A snapshot of typing progress, for asserting that a keystroke landed.
 *
 * Both halves are needed. The obvious check -- did the typed-letter count go
 * up -- is wrong on the opening platforms, which carry single letters: one
 * correct keystroke CLEARS the platform, so the count goes from zero to zero
 * and a working game looks broken. So a cleared platform counts as progress
 * too, which is what the word identity is for.
 */
export async function progress(page) {
  return { word: await activeWord(page), typed: await typedCount(page) };
}

/** Whether `after` shows a keystroke having been accepted since `before`. */
export function advanced(before, after) {
  if (before.word === null || after.word === null) return false;
  return after.typed > before.typed || after.word !== before.word;
}

/** Whether a run is still in progress. */
export function playing(page) {
  return page.evaluate(() => document.querySelector("canvas.water") !== null);
}

/**
 * Clears `count` platforms.
 *
 * Reads the remaining letters each time rather than replaying a plan: a run
 * that auto-pauses discards keystrokes, and a script tracking its own index
 * would desynchronise and then type garbage into a live game.
 */
export async function climb(page, count, delay = 40) {
  let cleared = 0;
  for (let i = 0; i < count; i++) {
    const word = await activeWord(page);
    if (!word) break;
    await page.keyboard.type(word.slice(await typedCount(page)), { delay });
    await page.waitForTimeout(300);
    cleared++;
  }
  return cleared;
}

/**
 * Ends a run as fast as the game honestly allows, and waits for the analysis.
 *
 * By drowning, because there is no clock to run down. The flood holds still
 * for the first three platforms, so it has to be woken by clearing them --
 * and after that, doing nothing is the quickest way down: the gap closes in
 * about fourteen seconds at the opening rate.
 */
export async function drown(page) {
  await climb(page, 4);
  await waitForResults(page);
}

/**
 * Waits for a run to end and its analysis to render.
 *
 * Keyed on the Again button, which exists only in the results. The obvious
 * signal -- the word "wpm" appearing on the page -- is wrong: the in-game HUD
 * carries a WPM readout too, so it matches instantly and the script silently
 * measures a screen that is still being played.
 */
export async function waitForResults(page) {
  await page.getByRole("button", { name: "Again", exact: true }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(700);
}
