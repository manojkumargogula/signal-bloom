import type { Metadata } from "next";
import Link from "next/link";
import { Answer, DocPage } from "@/components/site/DocPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, techArticle } from "@/lib/schema";
import { abs, REPO_URL } from "@/lib/paths";
import { RELICS } from "@/engine/relics/defs";

const TITLE = "How Signal Bloom works";
const DESCRIPTION =
  "Wave structure, relics, word selection, scoring and where your typing history is stored. Signal Bloom has no server: every run stays in your browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: abs("/how-it-works/") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: abs("/how-it-works/") },
};

export default function HowItWorksPage() {
  const byRarity = {
    common: RELICS.filter((r) => r.rarity === "common"),
    rare: RELICS.filter((r) => r.rarity === "rare"),
    epic: RELICS.filter((r) => r.rarity === "epic"),
  };

  return (
    <>
      <JsonLd data={techArticle({ headline: TITLE, description: DESCRIPTION, path: "/how-it-works/" })} />
      <JsonLd
        data={breadcrumbs([
          { name: "Signal Bloom", path: "/" },
          { name: TITLE, path: "/how-it-works/" },
        ])}
      />

      <DocPage
        eyebrow="Documentation"
        title="How the game works"
        lede="Signal Bloom is a listening post. Words arrive as transmissions closing on
          your position, and you decode one by typing it before it reaches you. Three modes
          share the same engine and the same analysis."
      >
        <Answer id="onslaught" question="What happens during an Onslaught wave?">
          <p>
            Transmissions appear at the rim of the scope on random bearings and close on
            the centre, where you are. Your first keystroke locks the nearest transmission
            whose word begins with that character, and you stay locked to it until it is
            decoded or it breaches the perimeter.
          </p>
          <p>
            That commitment is deliberate. If a mistyped character silently switched
            targets you would never understand what went wrong, so a wrong key on a locked
            transmission is simply an error: it breaks your combo and leaves you where you
            were.
          </p>
          <p>
            Each wave sends a fixed number of transmissions and gives you a clock. Clear
            them all and the wave ends. Let the clock run out and it ends anyway, at the
            cost of a shield. Halfway through a wave a carrier arrives, carrying a longer
            word and moving more slowly than the rest.
          </p>
        </Answer>

        <Answer id="relics" question="How do relics change a run?">
          <p>
            Between waves you are offered three relics and may take one. A relic changes
            the rules for the rest of the run, and they stack: the point of a run is the
            build you end up with, not the score by itself.
          </p>
          <p>
            There are {RELICS.length} relics at three rarities. Common relics adjust the
            numbers, rare relics change how a mechanic behaves, and epic relics are only
            offered from the middle of a run onward.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {[...byRarity.epic, ...byRarity.rare, ...byRarity.common].map((relic) => (
              <li key={relic.id} className="flex flex-wrap gap-x-2 leading-relaxed">
                <span className="font-semibold text-[var(--fg)]">{relic.name}</span>
                <span className="label mt-1 shrink-0">{relic.rarity}</span>
                <span className="basis-full text-[var(--fg-muted)]">{relic.blurb}</span>
              </li>
            ))}
          </ul>
        </Answer>

        <Answer id="sprint" question="How does Sprint choose its words?">
          <p>
            Sprint draws from a shuffled bag rather than picking at random, so every word
            in the list appears once before any of them repeats. Independent random draws
            produce immediate repetitions that players read as a bug.
          </p>
          <p>
            Word lists ship with the game and cover common English, longer and less common
            vocabulary, programming symbols and keywords, numbers, and public-domain
            quotations. The clock starts on your first keystroke, not when the page loads.
          </p>
        </Answer>

        <Answer id="scoring" question="How is a run scored?">
          <p>
            Score applies only to Onslaught. Each decoded transmission is worth ten points
            per character, multiplied by your current combo and by a bonus for decoding
            without a single mistake. Your combo rises with every decode and resets to zero
            on any mistyped character or any transmission that gets through.
          </p>
          <p>
            Sprint and Zen have no score. Their output is the analysis, which is the point
            of them.
          </p>
        </Answer>

        <Answer id="reproducible" question="Are runs reproducible?">
          <p>
            Yes. Every run is defined by a seed, and all randomness — which words appear,
            where transmissions arrive, which relics are offered — is derived from it. The
            same seed produces the same run.
          </p>
          <p>
            Each of those draws its own independent stream from the seed, so adding a new
            random element to the game later cannot shift the word or relic sequence of a
            run that already exists.
          </p>
        </Answer>

        <Answer id="storage" question="Where is my typing history stored?">
          <p>
            In your browser, in localStorage, on the device you played on. Signal Bloom has
            no server, no account system and no database, so there is nowhere else for it to
            go. Nothing you type is transmitted anywhere.
          </p>
          <p>
            The consequences are worth stating plainly: your history does not follow you to
            another device or another browser, and clearing site data erases it. Nothing is
            written to storage during a run — writing to localStorage is synchronous and
            would show up as a dropped keystroke — so a run is saved once, when it ends.
          </p>
        </Answer>

        <Answer id="offline" question="Does Signal Bloom work offline?">
          <p>
            Yes. A service worker caches the game and the reference pages on your first
            visit, so after that it loads and plays with no network connection at all. The
            whole game is static files with its word lists in the bundle, so there is
            nothing it needs to fetch while you play.
          </p>
          <p>
            When a new version is available it waits rather than replacing the running one,
            and the status bar offers a reload. Swapping the code underneath a run in
            progress would destroy it.
          </p>
        </Answer>

        <Answer id="contribute" question="Can I add my own word list?">
          <p>
            Yes, and it is meant to be the easiest contribution to make. A word list is a
            single file with a default export: an id, a label, a language, the licence of
            whatever you sourced the words from, and the words. Drop it in{" "}
            <code className="type-surface text-[var(--fg)]">src/data/words/</code>, add two
            lines to the registry, and it appears in the word-list selector.
          </p>
          <p>
            Tests run over every registered list automatically and check for duplicates,
            Unicode normalisation, length bounds and a declared licence, so a list is
            validated rather than reviewed by eye.{" "}
            <a href={REPO_URL} className="text-[var(--amber)] underline-offset-4 hover:underline">
              The source is on GitHub
            </a>
            .
          </p>
        </Answer>

        <Answer id="metrics-link" question="What do the numbers after a run mean?">
          <p>
            Every figure has an exact formula and Signal Bloom writes all of them down.{" "}
            <Link href="/metrics/" className="text-[var(--amber)] underline-offset-4 hover:underline">
              See the metrics glossary
            </Link>
            .
          </p>
        </Answer>
      </DocPage>
    </>
  );
}
