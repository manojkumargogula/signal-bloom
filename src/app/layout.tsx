import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/react/useTheme";
import { abs, SITE } from "@/lib/paths";
import "./globals.css";

/*
 * Fonts are self-hosted by next/font at build time, so there is no request to
 * a third-party origin at runtime. Both are preloaded: the display face
 * carries the heading that must win largest-contentful-paint, and the mono
 * face is the typing surface itself, which is above the fold.
 */
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
  preload: true,
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  // Absolute URLs are built with abs() rather than left relative, because
  // `new URL('/x', 'https://host/signal-bloom/')` resolves to
  // 'https://host/x' -- a leading slash discards the base path, which would
  // silently point every canonical at a page that does not exist.
  metadataBase: new URL(SITE.origin),
  title: {
    default: "Signal Bloom — a typing game with real typing analysis",
    template: "%s · Signal Bloom",
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.author, url: SITE.github }],
  creator: SITE.author,
  category: "games",
  keywords: [
    "typing game",
    "typing test",
    "wpm test",
    "typing speed",
    "typing practice",
    "keyboard heatmap",
    "typing analytics",
    "open source typing game",
  ],
  alternates: { canonical: abs("/") },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
    url: abs("/"),
    title: "Signal Bloom — a typing game with real typing analysis",
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal Bloom — a typing game with real typing analysis",
    description: SITE.tagline,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060b14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fa" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  // The mobile keyboard must not shrink the visual viewport out from under
  // the typing surface.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Blocking and inline on purpose: the theme has to be resolved before
            first paint, or the page renders in the wrong one and snaps. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${chakra.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
