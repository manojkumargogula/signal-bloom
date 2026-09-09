import { abs, REPO_URL, SITE } from "./paths";

/**
 * JSON-LD builders.
 *
 * Deliberately restrained. VideoGame and WebApplication are both subclasses
 * of SoftwareApplication, so this emits ONE node typed as both rather than
 * three nodes describing the same thing. HowTo is skipped because Google
 * retired its rich result in 2023, and Organization is skipped because a solo
 * MIT project is a Person, not an organisation.
 *
 * Nothing here is fabricated: no ratings, no review counts, no install
 * figures. Inventing those is both a policy violation and a lie.
 */

const AUTHOR_ID = `${abs("/")}#author`;
const GAME_ID = `${abs("/")}#game`;

export function gameGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${abs("/")}#website`,
        url: abs("/"),
        name: SITE.name,
        description: SITE.description,
        inLanguage: "en",
        publisher: { "@id": AUTHOR_ID },
      },
      {
        "@type": "Person",
        "@id": AUTHOR_ID,
        name: SITE.author,
        url: REPO_URL,
      },
      {
        "@type": ["VideoGame", "WebApplication"],
        "@id": GAME_ID,
        name: SITE.name,
        url: abs("/"),
        description: SITE.description,
        applicationCategory: "GameApplication",
        genre: ["Typing game", "Typing test", "Roguelite", "Educational game"],
        gamePlatform: "Web browser",
        playMode: "SinglePlayer",
        operatingSystem: "Any modern web browser",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        license: "https://opensource.org/license/mit",
        inLanguage: "en",
        creator: { "@id": AUTHOR_ID },
        sameAs: [REPO_URL],
        // An extractable capability list is one of the few pieces of
        // structured data an answer engine can quote directly.
        featureList: [
          "Wave-based typing roguelite with between-wave upgrades (Onslaught)",
          "Timed typing test at 15, 30, 60 or 120 seconds (Sprint)",
          "Untimed practice with no fail state (Zen)",
          "Net WPM, raw WPM, accuracy and consistency for every run",
          "Per-second WPM chart",
          "Per-key error and latency heatmap",
          "Per-finger accuracy breakdown",
          "Problem key and problem bigram detection",
          "Dark and light themes",
          "Fullscreen support",
          "No account required; all data stored locally in the browser",
        ],
      },
    ],
  };
}

export function breadcrumbs(trail: { name: string; path: `/${string}` }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: abs(entry.path),
    })),
  };
}

export function faqPage(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      // Must match the visible answer verbatim, which is why both are
      // generated from the same array.
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export function definedTermSet(
  terms: { term: string; definition: string; anchor: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${abs("/metrics/")}#glossary`,
    name: "Typing metrics glossary",
    url: abs("/metrics/"),
    hasDefinedTerm: terms.map((entry) => ({
      "@type": "DefinedTerm",
      name: entry.term,
      description: entry.definition,
      url: `${abs("/metrics/")}#${entry.anchor}`,
    })),
  };
}

export function techArticle(options: {
  headline: string;
  description: string;
  path: `/${string}`;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: options.headline,
    description: options.description,
    url: abs(options.path),
    author: { "@id": AUTHOR_ID },
    publisher: { "@id": AUTHOR_ID },
    inLanguage: "en",
    isPartOf: { "@id": `${abs("/")}#website` },
    about: { "@id": GAME_ID },
  };
}
