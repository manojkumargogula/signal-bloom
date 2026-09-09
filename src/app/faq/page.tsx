import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, faqPage } from "@/lib/schema";
import { abs, REPO_URL } from "@/lib/paths";

const TITLE = "Frequently asked questions";
const DESCRIPTION =
  "Cost, accounts, data storage, mobile support, keyboard layouts, offline play and licensing for Signal Bloom.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: abs("/faq/") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: abs("/faq/") },
};

/**
 * The questions and their answers, in one place.
 *
 * The visible list and the FAQPage structured data are generated from this
 * array, so the schema cannot claim an answer the page does not give. Each
 * answer is written to stand on its own if it is lifted out of the page,
 * because that is exactly what an answer engine does with it.
 */
const FAQ: { id: string; question: string; answer: string }[] = [
  {
    id: "free",
    question: "Is Signal Bloom free?",
    answer:
      "Yes. Signal Bloom is free to play with no advertisements, no subscription and no paid tier. It is also open source under the MIT licence, so you can read the code, modify it, or host your own copy.",
  },
  {
    id: "account",
    question: "Do I need an account?",
    answer:
      "No. There is no sign-up, no login and no account system of any kind. You can start typing the moment the page loads, and your run history is kept in your own browser.",
  },
  {
    id: "data",
    question: "Where is my typing data stored?",
    answer:
      "All of it stays in your browser's localStorage on the device you played on. Signal Bloom has no server and no database, so nothing you type is sent anywhere. It keeps your last 500 runs and shows a trend across them. The trade-off is that your history does not follow you to another device or browser, and clearing your site data erases it.",
  },
  {
    id: "tracking",
    question: "Does Signal Bloom track me or show ads?",
    answer:
      "No. There are no advertisements, no analytics, no cookies and no third-party scripts of any kind. The game makes no network requests after it has loaded.",
  },
  {
    id: "mobile",
    question: "Does Signal Bloom work on mobile?",
    answer:
      "It runs on a phone or tablet and the on-screen keyboard will open, but the game is designed for a physical keyboard: it expects two hands on real keys and is much harder without them.",
  },
  {
    id: "layouts",
    question: "Does Signal Bloom support Dvorak or Colemak?",
    answer:
      "You can play on any layout right now, because the game reads the characters your keyboard produces rather than assuming particular key positions. The per-key heatmap and per-finger breakdown currently assume QWERTY fingering. Signal Bloom records physical key codes for every keystroke, so adding a layout is a matter of adding its finger map.",
  },
  {
    id: "languages",
    question: "Which languages and word lists are available?",
    answer:
      "Signal Bloom ships with English word lists at two difficulty levels, a list of programming symbols and keywords, a numbers drill, and public-domain quotations. Word lists are single files, so a new list in any language is a small contribution rather than a change to the game.",
  },
  {
    id: "offline",
    question: "Can I play Signal Bloom offline?",
    answer:
      "Yes. A service worker caches the game on your first visit, so after that it loads and plays with no network connection at all, including the reference pages. The whole game is static files with its word lists in the bundle, so there is nothing it needs to fetch while you play.",
  },
  {
    id: "trust",
    question: "Is the typing speed it reports a real one?",
    answer:
      "Yes, and it is measured the same way a conventional typing test measures it: net WPM from correctly typed characters over elapsed time, accuracy judged at the first press of each key. The game presents one word at a time, so the character it expected from you is never ambiguous and every keystroke can be judged \u2014 which is what makes the figure trustworthy and lets it feed your personal bests and long-term key statistics. What it is NOT is directly comparable with a calm typing test, because a rising flood changes how you type. Treat it as your speed under pressure.",
  },
  {
    id: "reset",
    question: "How do I reset my run history?",
    answer:
      "There is a \u201cClear all history\u201d button under the table of past runs on the results screen, which removes every stored run and personal best. Clearing the site data for Signal Bloom in your browser does the same thing. Because the history lives only in your browser, there is nothing stored elsewhere to delete.",
  },
  {
    id: "accuracy-harsh",
    question: "Why is my accuracy lower than on other typing sites?",
    answer:
      "Signal Bloom judges accuracy at the moment each key is pressed and never restores it when you backspace. Many typing tests compare only your final text against the target, which hides every mistake you noticed and corrected. Both definitions are defensible, but the stricter one tells you more about your typing.",
  },
  {
    id: "contribute",
    question: "How do I report a bug or contribute?",
    answer:
      "Open an issue or a pull request on GitHub. Word lists, themes and relics are each designed as a single-file addition, so those are the easiest places to start.",
  },
];

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqPage(FAQ.map(({ question, answer }) => ({ question, answer })))} />
      <JsonLd
        data={breadcrumbs([
          { name: "Signal Bloom", path: "/" },
          { name: TITLE, path: "/faq/" },
        ])}
      />

      <DocPage
        eyebrow="Questions"
        title="Frequently asked questions"
        lede="Short answers about cost, privacy, storage, keyboards and licensing. If
          something is missing, the source is public and issues are welcome."
      >
        <dl className="flex flex-col gap-9">
          {FAQ.map((entry) => (
            <div key={entry.id} id={entry.id} className="scroll-mt-20">
              <dt className="text-xl font-semibold tracking-tight text-[var(--fg)]">
                <a href={`#${entry.id}`} className="hover:text-[var(--amber)]">
                  {entry.question}
                </a>
              </dt>
              <dd className="mt-3 leading-relaxed text-[var(--fg-muted)]">{entry.answer}</dd>
            </div>
          ))}
        </dl>

        <p className="text-[var(--fg-muted)]">
          Still curious?{" "}
          <Link href="/metrics/" className="text-[var(--amber)] underline-offset-4 hover:underline">
            The metrics glossary
          </Link>{" "}
          explains every number, and{" "}
          <a href={REPO_URL} className="text-[var(--amber)] underline-offset-4 hover:underline">
            the source
          </a>{" "}
          answers everything else.
        </p>
      </DocPage>
    </>
  );
}
