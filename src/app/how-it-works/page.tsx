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
        lede="Signal Bloom is one game. You are a technician climbing a signal array,
          typing the word on the platform above to leap to it, while a flood rises under
          you. There is no clock — the water is the clock."
      >
        <Answer id="ascent" question="What happens during a climb?">
          <p>
            Your climber stands on a ledge. The platform above it carries a word, and two
            more above that carry theirs, so you can read ahead — reading ahead is what
            removes the pause at every word boundary and lets a fast typist find a rhythm.
          </p>
          <p>
            Every letter you get right lights up on the slab and visibly loads the jump:
            the climber sinks into a deeper crouch as the word fills. Finishing the word
            releases the leap. A wrong letter turns that letter red and costs you, but it
            never moves you — you stay where you are and try the letter again.
          </p>
          <p>
            A flood rises from below and speeds up with every platform you clear. It is
            the only thing that can end a run. Mistakes feed it: once your shields are
            gone, a wrong letter costs you distance from the water. So the flood is the
            reason to type quickly and the water level is also the reason to type
            accurately — one thing to watch, two ways to lose ground.
          </p>
          <p>
            It holds completely still for your first three platforms. The opening has to
            be readable before it is survivable, and a first-time player types far slower
            while they are working out what the screen means.
          </p>
          <p>
            A word typed with no mistakes at all slows the flood for a moment. It never
            pushes it back down, only slows it — the water is a threat, not a tide.
          </p>
        </Answer>

        <Answer id="relics" question="How do relics change a run?">
          <p>
            Every twelve platforms completes a band: the world changes colour, a shield
            appears on an upcoming platform, the words get longer, and you are offered
            three relics and may take one. A relic changes the rules for the rest of the
            climb, and they stack: the point of a run is the build you end up with, not
            the height by itself.
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

        <Answer id="difficulty" question="How does the climb get harder?">
          <p>
            Two ways, and neither is the flood alone. Word length steps up with each band,
            from single letters at the very start to eight, and it stops there: past eight
            letters a longer word only buys more seconds per platform, which turns the leap
            into rare punctuation instead of a reward for each word.
          </p>
          <p>
            The rest is the flood, which multiplies its speed by about one and a half
            percent for every platform you clear. Because it accelerates per platform
            rather than per second, a slower typist never meets a fast flood — it is fast
            because you climbed, not because time passed — so one curve works for
            everybody. Runs land between about a minute and a half and three minutes at
            every speed, and how far up you get is what differs: around forty platforms
            at fifteen words a minute, two hundred at a hundred and twenty. Typing faster
            makes the run shorter, not longer — you are simply much higher when the water
            reaches you, and height is the score.
          </p>
        </Answer>

        <Answer id="words" question="Where do the words come from?">
          <p>
            A list that ships with the game, combining the most common English words with
            a longer and less common vocabulary. Both halves are needed: word length steps
            up with each band, and the common list alone holds only sixty-four words of six
            to eight letters, so a long climb would circle the same few dozen from band
            four onward.
          </p>
          <p>
            Within a length, words are drawn from a shuffled bag rather than picked at
            random, so every candidate appears once before any of them repeats. Independent
            random draws produce immediate repetitions that players read as a bug.
          </p>
        </Answer>

        <Answer id="scoring" question="How is a run scored?">
          <p>
            Deliberately two things rather than four: ten points per platform, multiplied
            by your combo. Your combo rises with every word typed without a mistake and
            resets on any wrong letter. Height is the number worth bragging about.
          </p>
          <p>
            The analysis is the other half of the output, and it does not depend on the
            score at all — it is derived from the keystroke log, so it says the same thing
            about a run that ended at platform twelve as about one that ended at two
            hundred.
          </p>
        </Answer>

        <Answer id="reproducible" question="Are runs reproducible?">
          <p>
            Yes. Every run is defined by a seed, and all randomness — which words appear,
            which side of the route each platform sits on, which relics are offered — is
            derived from it. The same seed produces the same climb.
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
