import type { NextConfig } from "next";

// GitHub Pages serves project sites from a subpath, so every asset and link
// has to be prefixed. CI injects NEXT_PUBLIC_BASE_PATH from the
// configure-pages action; locally it is unset so `next dev` stays at "/".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // assetPrefix is deliberately NOT set. basePath already prefixes /_next/*,
  // and setting both double-prefixes every asset. It also does nothing for
  // paths into public/, which is what people expect it to fix — those go
  // through asset() in src/lib/paths.ts instead.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // No headers(), redirects() or rewrites() here: a static export ignores all
  // three silently, so leaving them in would only mislead the next reader.
};

export default nextConfig;
