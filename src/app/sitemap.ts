import type { MetadataRoute } from "next";
import { CONTENT_ROUTES } from "@/lib/content";
import { abs } from "@/lib/paths";
import lastmod from "@/lib/lastmod.generated.json";

/**
 * `lastModified` is the real git commit time of each page's source, written at
 * prebuild by scripts/gen-lastmod.mjs. Using the build time instead would
 * stamp every page as changed on every deploy, which trains search engines to
 * ignore the field entirely — the most common self-inflicted sitemap wound.
 *
 * `priority` and `changeFrequency` are deliberately omitted: Google has said
 * for years that it ignores both, so they are noise in a review diff.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const dates = lastmod as Record<string, string>;
  return CONTENT_ROUTES.map((route) => ({
    url: abs(route.path),
    lastModified: dates[route.source] ?? dates.__build,
  }));
}
