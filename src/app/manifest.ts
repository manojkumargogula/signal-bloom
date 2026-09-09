import type { MetadataRoute } from "next";
import { asset } from "@/lib/paths";

/**
 * Every path here is passed through `asset()`.
 *
 * Next does not prefix the string paths inside a manifest with the base path,
 * and a manifest whose `scope` is "/" on a project site hosted under a
 * subpath is invalid — which kills the install prompt with no console error
 * and no visible symptom.
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: asset("/"),
    name: "Signal Bloom — typing game",
    short_name: "Signal Bloom",
    description:
      "A typing game that measures how you actually type. Works offline, no account.",
    start_url: asset("/"),
    scope: asset("/"),
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    categories: ["games", "education", "utilities"],
    lang: "en",
    dir: "ltr",
    icons: [
      { src: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: asset("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: asset("/icons/maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    prefer_related_applications: false,
  };
}
