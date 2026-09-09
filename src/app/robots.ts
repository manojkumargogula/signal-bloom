import type { MetadataRoute } from "next";
import { abs } from "@/lib/paths";

/**
 * AI crawlers are allowed on purpose.
 *
 * Being quotable is the entire point of writing the metrics glossary the way
 * it is written, and there is no version of "I want to be cited but not
 * fetched". There is nothing proprietary here to protect: the code is MIT and
 * the prose exists to be read.
 *
 * Common Crawl is the one exception. It is a bulk archive redistributed to
 * anyone, produces no citation and no referral, and is the mechanism by which
 * a stale copy of these pages is still being served years from now. Every
 * frontier lab runs its own crawler, so declining it costs nothing.
 *
 * Worth remembering that robots.txt is honour-system, and that on a GitHub
 * Pages project site this file is served under the base path, where crawlers
 * do not look for it — only a custom domain or a user-site repository puts it
 * at the origin root where it takes effect.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "CCBot", disallow: "/" },
    ],
    sitemap: abs("/sitemap.xml"),
  };
}
