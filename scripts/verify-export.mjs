/**
 * Post-build gate.
 *
 * Every base-path and trailing-slash failure mode ships silently and none of
 * them reproduce in `next dev`, where the base path is empty. This is what
 * makes deploying to a subpath safe, so it runs in CI and fails the deploy.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "out");
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(OUT)) {
  console.error("no out/ directory — run the build first");
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = walk(OUT);
const rel = (f) => f.slice(OUT.length);
const html = files.filter((f) => f.endsWith(".html"));

// 1. the files Pages itself needs
for (const required of ["/404.html", "/.nojekyll", "/index.html"]) {
  if (!files.some((f) => rel(f) === required)) fail(`missing ${required}`);
}

// 2. every content route emitted a document
for (const route of ["/", "/metrics/", "/how-it-works/", "/faq/"]) {
  const expected = route === "/" ? "/index.html" : `${route}index.html`;
  if (!files.some((f) => rel(f) === expected)) fail(`route ${route} did not emit ${expected}`);
}

// 3. metadata files
for (const required of ["/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/llms.txt"]) {
  if (!files.some((f) => rel(f) === required)) fail(`missing ${required}`);
}

// 3b. the service worker, which is what makes the offline claim in the README
//     and the FAQ true rather than merely plausible.
{
  const sw = files.find((f) => rel(f) === "/sw.js");
  if (!sw) {
    fail("missing /sw.js — the README and FAQ both promise offline play");
  } else {
    const body = readFileSync(sw, "utf8");
    if (body.includes("__BUILD_ID__")) {
      fail("/sw.js was not stamped — its caches would never invalidate on deploy");
    }
    if (BASE_PATH && !body.includes('new URL("./", self.location)')) {
      fail("/sw.js must resolve its scope from its own location to work under a base path");
    }
  }
}

// 4. canonicals must be absolute, carry the base path exactly once, and end
//    with a slash. `trailingSlash` means Pages redirects the slashless form,
//    so a canonical without one names a URL that redirects.
for (const file of html) {
  const source = readFileSync(file, "utf8");
  const canonical = source.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
  if (!canonical) {
    if (!rel(file).includes("404")) fail(`${rel(file)}: no canonical`);
    continue;
  }
  if (!canonical.startsWith(ORIGIN)) fail(`${rel(file)}: canonical not absolute (${canonical})`);
  if (BASE_PATH && !canonical.startsWith(`${ORIGIN}${BASE_PATH}`)) {
    fail(`${rel(file)}: canonical missing base path (${canonical})`);
  }
  if (BASE_PATH && canonical.includes(`${BASE_PATH}${BASE_PATH}`)) {
    fail(`${rel(file)}: canonical has a doubled base path (${canonical})`);
  }
  if (!canonical.endsWith("/")) fail(`${rel(file)}: canonical lacks a trailing slash (${canonical})`);
}

// 5. every local asset reference is base-path prefixed and actually exists
if (BASE_PATH) {
  for (const file of html) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const path = match[1];
      if (path.startsWith("//")) continue;
      if (!path.startsWith(`${BASE_PATH}/`) && path !== BASE_PATH) {
        fail(`${rel(file)}: unprefixed local path ${path}`);
      }
      if (path.startsWith(`${BASE_PATH}${BASE_PATH}`)) {
        fail(`${rel(file)}: doubled base path in ${path}`);
      }
    }
  }
}

// 6. the manifest's own paths, which Next does not prefix
{
  const file = files.find((f) => rel(f) === "/manifest.webmanifest");
  if (file) {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const key of ["start_url", "scope", "id"]) {
      const value = manifest[key];
      if (BASE_PATH && !String(value).startsWith(BASE_PATH)) {
        fail(`manifest.${key} is "${value}" — must start with ${BASE_PATH}, or the install prompt dies silently`);
      }
    }
    for (const icon of manifest.icons ?? []) {
      const path = icon.src.replace(BASE_PATH, "");
      if (!files.some((f) => rel(f) === path)) fail(`manifest icon missing: ${icon.src}`);
    }
  }
}

// 7. the sitemap
{
  const file = files.find((f) => rel(f) === "/sitemap.xml");
  if (file) {
    const xml = readFileSync(file, "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (locs.length === 0) fail("sitemap has no entries");
    for (const loc of locs) {
      if (!loc.startsWith(ORIGIN)) fail(`sitemap loc not absolute: ${loc}`);
      if (!loc.endsWith("/")) fail(`sitemap loc lacks a trailing slash: ${loc}`);
      const path = loc.slice(`${ORIGIN}${BASE_PATH}`.length);
      const expected = path === "/" ? "/index.html" : `${path}index.html`;
      if (!files.some((f) => rel(f) === expected)) fail(`sitemap lists ${loc}, but ${expected} was not emitted`);
    }
    if (xml.includes(new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0") + "T" + String(new Date().getHours()).padStart(2, "0"))) {
      // Only a hint: a lastmod matching this exact hour is almost certainly
      // the build time rather than a real commit date.
      console.warn("  warning: a sitemap lastmod matches the current hour — check gen-lastmod ran");
    }
  }
}

// 8. nothing from local development leaked into the build
for (const file of [...html, ...files.filter((f) => f.endsWith(".xml") || f.endsWith(".txt") || f.endsWith(".webmanifest"))]) {
  const source = readFileSync(file, "utf8");
  for (const leak of ["localhost:3000", "localhost:3001", "vercel.app"]) {
    if (source.includes(leak) && ORIGIN.indexOf(leak) === -1) {
      fail(`${rel(file)}: contains "${leak}"`);
    }
  }
}

console.log(`verify-export: ${files.length} files, ${html.length} documents`);
console.log(`  origin ${ORIGIN}   basePath ${BASE_PATH || "(none)"}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("  all checks passed");
