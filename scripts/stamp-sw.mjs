/**
 * Stamps the exported service worker with a build identity.
 *
 * Operates on out/sw.js rather than the source, so the committed file keeps
 * its placeholder and does not churn on every commit. The cache names include
 * the identity, so a deploy discards the previous caches instead of serving a
 * mix of old and new files. Derived from the commit SHA, which means
 * rebuilding the same commit produces an identical worker.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "out");
const target = resolve(OUT, "sw.js");

if (!existsSync(target)) {
  console.error("stamp-sw: out/sw.js not found — run the build first");
  process.exit(1);
}

let id = "dev";
try {
  id =
    execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() ||
    id;
} catch {
  // Not a git checkout.
}

const body = readFileSync(target, "utf8");
if (!body.includes("__BUILD_ID__")) {
  console.error("stamp-sw: no __BUILD_ID__ placeholder in out/sw.js");
  process.exit(1);
}

/**
 * Collects the build assets the exported documents actually reference.
 *
 * Scraped from the emitted HTML rather than by globbing _next/static, so the
 * list is exactly what a first paint needs and nothing else -- no unused
 * chunks, no source maps. Fonts are picked up the same way, since next/font
 * self-hosts them into the same tree.
 *
 * This is the difference between a site that loads offline and one that can
 * be played offline: a service worker does not intercept the requests of the
 * page that registered it, so anything not precached here is simply missing
 * on the first offline visit.
 */
function collectAssets() {
  const referenced = new Set();

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const html = readFileSync(full, "utf8");
        for (const match of html.matchAll(/["'(]([^"'()\s]*\/_next\/static\/[^"'()\s]+?)["')]/g)) {
          // Next inlines JSON containing escaped quotes, so a capture can end
          // with a stray backslash. Left in, those entries 404 on install and
          // half the manifest is duplicates of the real paths.
          referenced.add(match[1].replace(/\\+$/, ""));
        }
      }
    }
  };
  walk(OUT);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const cleaned = [...referenced]
    // Stored relative to the worker's own scope, so the same list is correct
    // at a subpath and at a domain root.
    .map((path) => path.replace(/^\//, "").replace(new RegExp(`^${basePath.replace(/^\//, "")}\/?`), ""))
    .filter((path) => path.startsWith("_next/static/"))
    .filter((path) => !path.endsWith(".map"))
    // Anything with a backslash or a quote survived the scrape mangled, and a
    // mangled path is a silent 404 at install time.
    .filter((path) => !/[\\"']/.test(path));

  return [...new Set(cleaned)].sort();
}

const assets = collectAssets();
if (assets.length === 0) {
  console.error("stamp-sw: found no build assets to precache — offline play would be broken");
  process.exit(1);
}

// Every path has to exist in the export. A path that does not is a silent
// failure: cache.add rejects, the catch swallows it, and the gap only shows up
// as a game that will not start offline.
const missing = assets.filter((path) => !existsSync(resolve(OUT, path)));
if (missing.length > 0) {
  console.error(`stamp-sw: ${missing.length} precache path(s) do not exist in out/:`);
  for (const path of missing) console.error(`  ${path}`);
  process.exit(1);
}

writeFileSync(
  target,
  body.replace(/__BUILD_ID__/g, id).replace("__PRECACHE__", JSON.stringify(assets)),
);
console.log(`stamp-sw: ${id}, ${assets.length} assets precached`);
