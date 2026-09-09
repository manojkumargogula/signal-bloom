/*
 * Signal Bloom service worker.
 *
 * This does two jobs, and the second is the less obvious one.
 *
 * 1. Offline play. The whole game is static files with its word lists in the
 *    bundle, so once it has loaded there is genuinely nothing it needs the
 *    network for. The README and the FAQ both say so, which makes this the
 *    thing that keeps that claim true rather than merely plausible.
 *
 * 2. Caching. GitHub Pages serves everything with a short max-age and gives
 *    no way to set headers, so content-hashed bundles under /_next/static are
 *    re-validated every ten minutes forever. A cache-first rule here is a
 *    complete substitute for the Cache-Control header that cannot be set, and
 *    it is safe precisely because those filenames contain a content hash.
 *
 * Hand-written rather than generated. It is sixty lines, and the plugin route
 * fights a static export over where the file ends up.
 */

// Rewritten at build time to the commit SHA, so a deploy invalidates cleanly.
const VERSION = "__BUILD_ID__";
const SHELL_CACHE = `signalbloom-shell-${VERSION}`;
const ASSET_CACHE = `signalbloom-assets-${VERSION}`;

// Resolved from this file's own location, so the same worker is correct at a
// subpath and at a domain root without being told which it is.
const BASE = new URL("./", self.location).pathname;

const SHELL = [
  BASE,
  `${BASE}metrics/`,
  `${BASE}how-it-works/`,
  `${BASE}faq/`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
];

/**
 * The build assets the documents actually reference, injected at build time
 * by scripts/stamp-sw.mjs.
 *
 * These have to be precached rather than picked up lazily. A service worker
 * does not intercept the requests of the page that registered it, so on a
 * first visit the bundles are fetched without the worker involved and never
 * enter its cache -- which produced a site that loaded offline and then could
 * not run the game. Caching them at install is what closes that gap.
 */
const PRECACHE = __PRECACHE__.map((path) => `${BASE}${path}`);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(ASSET_CACHE);

      // Individually, so one missing entry cannot fail the whole install and
      // leave the site with no worker at all.
      await Promise.all([
        ...SHELL.map((url) =>
          shell.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
        ...PRECACHE.map((url) =>
          assets.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      ]);
    })(),
  );
  // Deliberately NOT skipWaiting. Swapping the bundle under a run in progress
  // would destroy it, which for a roguelite is unforgivable. The new worker
  // takes over on the next navigation instead.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("signalbloom-") && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// The page asks for the update when the player chooses to take it. This is
// the other half of not calling skipWaiting on install.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed bundles: cache first, forever. This is the header GitHub
  // Pages will not let us send.
  if (url.pathname.startsWith(`${BASE}_next/static/`)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Documents: network first with a short timeout, falling back to the cached
  // shell. Cache-first on HTML is how a site serves a stale page for a week
  // after a deploy.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const response = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 3000)),
          ]);
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return (await cache.match(request)) ?? (await cache.match(BASE)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else: cache first, then network, and remember what came back.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
