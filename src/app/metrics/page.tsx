import type { Metadata } from "next";
import { Answer, DocPage, Formula } from "@/components/site/DocPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, definedTermSet } from "@/lib/schema";
import { abs } from "@/lib/paths";

const TITLE = "Typing metrics glossary";
const DESCRIPTION =
  "What WPM, raw WPM, accuracy and consistency actually mean, with the exact formula Signal Bloom uses for each one and why it chose that definition.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: abs("/metrics/") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: abs("/metrics/") },
};

/**
 * Definitions, kept beside the prose that renders them.
 *
 * The structured data and the visible text come from one array, so the
 * schema can never claim something the page does not say.
 */
const TERMS = [
  {
    term: "WPM (words per minute)",
    anchor: "wpm",
    definition:
      "WPM is your net typing speed: the number of correctly typed characters divided by five, divided by the elapsed minutes. Five characters counts as one word because average English word length including its trailing space is close to five, which is the convention every serious typing test uses.",
  },
  {
    term: "Raw WPM",
    anchor: "raw-wpm",
    definition:
      "Raw WPM counts every character you typed, including the wrong ones, divided by five per minute. It measures how fast your hands moved regardless of whether the output was correct, so the gap between raw and net WPM is exactly what your mistakes cost you.",
  },
  {
    term: "Accuracy",
    anchor: "accuracy",
    definition:
      "Accuracy is the share of characters you got right on the first attempt, expressed as a percentage. Signal Bloom judges accuracy at the moment each key is pressed and never restores it when you backspace, because pressing the wrong key is a thing that happened and correcting it afterwards does not unhappen it.",
  },
  {
    term: "Consistency",
    anchor: "consistency",
    definition:
      "Consistency measures how evenly you held your speed across the run, on a scale from 0 to 100. It is derived from the coefficient of variation of your raw speed measured second by second: a run typed at a steady pace scores near 100, and a run of fast bursts separated by pauses scores much lower even when its average speed is identical.",
  },
  {
    term: "Problem key",
    anchor: "problem-keys",
    definition:
      "A problem key is a key that costs you measurable time, ranked by combining how much longer than usual you take to press it with how often you get it wrong. Signal Bloom requires at least eight attempts at a key before it will judge it, and weights the error rate by statistical confidence so a key you pressed three times cannot top the list.",
  },
  {
    term: "Problem bigram",
    anchor: "problem-bigrams",
    definition:
      "A bigram is a pair of adjacent letters, and a problem bigram is a pair that costs you time even when both of its letters are individually fine. Bigrams are usually more useful for practice than single keys, because awkward finger rolls and hand alternations only appear when two specific keys follow one another.",
  },
];

export default function MetricsPage() {
  return (
    <>
      <JsonLd data={definedTermSet(TERMS)} />
      <JsonLd
        data={breadcrumbs([
          { name: "Signal Bloom", path: "/" },
          { name: TITLE, path: "/metrics/" },
        ])}
      />

      <DocPage
        eyebrow="Reference"
        title="What every number on the results screen means"
        lede="Signal Bloom reports six figures after a run and derives all of them from a
          log of individual keystrokes rather than from running counters. Each formula is
          written out below, because a typing score you cannot check is just a number."
      >
        <Answer id="wpm" question="What is WPM (words per minute)?">
          <p>{TERMS[0].definition}</p>
          <Formula>{`netWPM = (correctCharacters / 5) / (minutes)`}</Formula>
          <p>
            Characters are counted rather than words, and the space between words counts
            as a character like any other. That is why a run of short words scores
            slightly higher than a run of long ones at the same finger speed.
          </p>
        </Answer>

        <Answer id="raw-wpm" question="What is raw WPM, and how is it different from net WPM?">
          <p>{TERMS[1].definition}</p>
          <Formula>{`rawWPM = (allTypedCharacters / 5) / (minutes)`}</Formula>
          <p>
            Raw is always equal to or higher than net. If the two are close, your speed is
            genuine. If raw is far ahead of net, you are typing faster than you can type
            correctly, and slowing down will make you faster overall.
          </p>
        </Answer>

        <Answer id="accuracy" question="How is typing accuracy calculated?">
          <p>{TERMS[2].definition}</p>
          <Formula>{`accuracy = correctFirstPresses / totalFirstPresses × 100`}</Formula>
          <p>
            Two consequences worth knowing. Backspacing does not repair accuracy, so the
            figure is harsher than most people expect. And retyping a character you already
            corrected is not counted a second time, so fixing a mistake carefully is never
            punished twice.
          </p>
        </Answer>

        <Answer id="consistency" question="What is typing consistency, and why does it matter?">
          <p>{TERMS[3].definition}</p>
          <Formula>{`cv = standardDeviation(rawWPMPerSecond) / mean(rawWPMPerSecond)
consistency = 100 × (1 − tanh(cv + cv³/3 + cv⁵/5))`}</Formula>
          <p>
            The polynomial is the Taylor series of the inverse hyperbolic tangent, which
            makes this almost exactly 100 × (1 − cv) for a steady run while saturating
            smoothly instead of going negative for an erratic one. It matches the mapping
            Monkeytype uses, so a consistency score here means the same thing as a
            consistency score there.
          </p>
          <p>
            Consistency is often the number worth improving first. Raising a jagged
            80&nbsp;WPM to a steady 80&nbsp;WPM is usually easier than raising the average,
            and it tends to raise the average as a side effect.
          </p>
        </Answer>

        <Answer id="good-wpm" question="What is a good WPM score?">
          <p>
            Around 40&nbsp;WPM is average for an adult typing on a full keyboard, 60 to
            80&nbsp;WPM is comfortable touch typing, and above 100&nbsp;WPM is fast by any
            ordinary standard. Competitive typists sustain 140&nbsp;WPM and beyond.
          </p>
          <p>
            A figure without its accuracy is meaningless, though. 90&nbsp;WPM at 92%
            accuracy produces less usable text than 70&nbsp;WPM at 99%, because every error
            costs far more time to find and fix than it saved by being typed quickly.
          </p>
        </Answer>

        <Answer id="raw-vs-net" question="Why is my raw WPM higher than my net WPM?">
          <p>
            Raw WPM is higher than net WPM whenever you typed characters that did not end
            up in the correct final text. That is normal: the two are only equal on a
            flawless run. A large gap means errors, and specifically errors you either left
            in place or spent keystrokes correcting.
          </p>
        </Answer>

        <Answer id="heatmap" question="What does the per-key heatmap show?">
          <p>
            The heatmap shows first-press accuracy for every key you were asked to press,
            laid out as a keyboard. A key is left neutral until you have pressed it at
            least three times, because two attempts say nothing.
          </p>
          <p>
            An attempt is attributed to the key you <em>needed</em>, not the key you hit.
            Press J when K was wanted and the miss is recorded against K. Recording it
            against J would tell you that J is unreliable, when the difficult key is K.
          </p>
        </Answer>

        <Answer id="problem-keys" question="What are problem keys and problem bigrams?">
          <p>{TERMS[4].definition}</p>
          <p>{TERMS[5].definition}</p>
          <Formula>{`costPerAttempt = (meanLatency − medianLatency) + wilsonLowerBound(errorRate) × 1000ms`}</Formula>
          <p>
            The result is expressed in milliseconds lost per attempt so that the ranking
            means something concrete, rather than being an opaque severity score.
          </p>
        </Answer>

        <Answer id="fingers" question="Which fingers does the per-finger breakdown assume?">
          <p>
            The breakdown assumes standard touch-typing fingering for the keyboard layout
            you have selected, which is QWERTY today. Physical keys are recorded rather
            than characters, so support for Dvorak, Colemak and other layouts is a matter
            of adding a finger map rather than re-recording anything.
          </p>
        </Answer>

        <Answer id="which-mode" question="Which mode should I trust for a real score?">
          <p>
            Both Sprint and Ascent report figures you can rely on, and both feed your
            personal bests. Each presents one word at a time, so the character the game
            expected from you is never ambiguous and every keystroke can be judged.
          </p>
          <p>
            Sprint is the one to use if you want a number comparable with other typing
            tests: it is a conventional timed test over a fixed body of text, with nothing
            chasing you. Ascent measures the same things, but under pressure from a rising
            flood — which is a real measurement of how you type when it matters, and not
            the same measurement as a calm one.
          </p>
        </Answer>

      </DocPage>
    </>
  );
}
