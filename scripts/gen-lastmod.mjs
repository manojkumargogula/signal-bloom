/**
 * Records the real git commit time of each content page's source.
 *
 * A sitemap that stamps `lastmod` with the build time claims every page
 * changed on every deploy, which teaches search engines to ignore the field.
 * This runs at prebuild and writes the actual commit dates instead.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "src/lib/lastmod.generated.json");

// The source paths are read out of the registry rather than duplicated here,
// so adding a page cannot silently leave it undated. Read with a regex because
// Node cannot import a TypeScript module directly.
const registry = readFileSync(resolve(root, "src/lib/content.ts"), "utf8");
const routes = [...registry.matchAll(/source:\s*"([^"]+)"/g)].map((m) => ({ source: m[1] }));

if (routes.length === 0) throw new Error("no content routes found in src/lib/content.ts");

// Only real commit dates go in here.
//
// Two values were tried and both were wrong. The build time rewrites the file
// on every run, so it can never be committed -- and it is precisely the value
// that must not reach a sitemap, because stamping every page as changed on
// every deploy teaches search engines to ignore the field. The newest commit
// in the repository has the same problem for a different reason: it changes
// with every commit, so the checked-in file is stale the moment anything
// lands.
//
// A page with no commit history simply gets no date. `lastModified` is
// optional in a sitemap, and omitting it is more honest than inventing one.
const out = {};

for (const route of routes) {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", route.source], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (iso) out[route.source] = iso;
  } catch {
    // Not a git checkout, or the file has never been committed. Falling back
    // to the build time is worse than a real date but better than failing.
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`lastmod: ${Object.keys(out).length} page(s) dated from git history`);
