# Contributing to Signal Bloom

Thanks for looking. This project is deliberately easy to contribute to in
three specific places, and those are the best ones to start with.

## Getting set up

```bash
pnpm install
pnpm dev
```

That is all of it. **No environment variables, no API keys, no database, no
accounts, no services to provision.** If you needed any of those, something
has gone wrong.

```bash
pnpm test         # Vitest, both projects
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm contrast     # WCAG gate over the design tokens
pnpm build        # static export into out/
```

## The three easy contributions

Each of these is one file. No registration step to remember, no switch
statement to extend, no other file to touch.

### Adding a word list

Create `src/data/words/<id>.ts`:

```ts
import type { Corpus } from "../types";

const corpus: Corpus = {
  id: "de-common",
  label: "German · common words",
  kind: "words",
  language: "de",       // BCP-47
  wpmUnit: "chars5",    // "chars5" for Latin scripts; see below
  source: {
    name: "Where you got the words",
    url: "https://example.org/source",
    license: "CC0-1.0", // REQUIRED, and checked against an allowlist
  },
  words: ["der", "die", "das" /* ... */],
};

export default corpus;
```

Then add two lines to `src/data/index.ts`, and run `pnpm test`.

Tests run over every registered list automatically and will reject duplicates,
un-normalised Unicode, stray whitespace, over-long entries, and a missing or
disallowed licence. **The licence field is not a formality.** A word list
scraped from a paid dictionary is the single easiest way for an MIT project to
quietly ingest someone else's copyright, and it arrives looking like a
one-line pull request. If you are not sure what licence your source is under,
say so in the pull request and we will work it out together.

`wpmUnit` exists because "five characters is one word" is a Latin-script
convention and meaningless for, say, Japanese. Use `chars5` unless your script
is one where that does not hold.

### Adding a relic

Append one object to `RELICS` in `src/engine/relics/defs.ts`:

```ts
{
  id: "phase-lock",
  name: "Phase Lock",
  blurb: "Fixing a mistyped character restores a shield.",
  rarity: "epic",
  maxStacks: 1,
  minWave: 3,
  modifiers: () => [{ stat: "shieldOnCorrection", op: "add", value: 1 }],
  hooks: {
    correction: (api) => api.grantShield(api.stats.shieldOnCorrection),
  },
}
```

A relic changes the game in exactly two ways, and neither of them is a branch
in the game loop:

- **`modifiers`** contributes stat operations, resolved once when the relic is
  picked into the flat table the loop reads every tick.
- **`hooks`** registers handlers on engine events, dispatched through
  `EffectApi` — the only surface a relic may mutate.

Two rules, both enforced by tests:

1. **Read your own numbers from a stat.** The example above takes its bonus
   from `shieldOnCorrection` rather than hardcoding `1`, so another relic can
   scale it without either knowing the other exists. This is what makes relics
   compose.
2. **Never call `Math.random`.** Use `api.rng()`, which draws from the run's
   seeded stream. Runs have to be reproducible.

Add one behaviour test next to the others in
`src/engine/relics/relics.test.ts`. There is also a property test that drafts
hundreds of random builds and asserts that no combination produces an
unplayable stat table, so your relic will be exercised against every other one
automatically.

Write the blurb as a concrete statement of what changes. A test rejects vague
words like "better" and "improved": a relic whose effect the player has to
guess at is a coin flip, not a choice.

### Adding a theme

Themes are token blocks in `src/app/globals.css`. Copy the
`:root[data-theme="light"]` block, change the values, and run
`pnpm contrast` — which parses the stylesheet itself and fails if any text
pair drops below WCAG AA. That check is what makes it safe to merge a theme
without reviewing it by eye.

Note that the palette is deliberately **one accent**. Red is reserved for
genuine errors. A theme that introduces a second accent hue is a different
design, not a new theme.

## How the codebase is arranged

```
src/engine/     the game: state, simulation, targeting, relics. No React,
                no DOM, no window -- it runs in plain Node under test.
src/analytics/  pure metric math. The most heavily tested code here.
src/input/      keyboard capture, on two channels (see below).
src/render/     imperative view layers: WebGL scope, DOM stage, particles.
src/react/      the bindings between the engine and React.
src/components/ presentation.
src/data/       word lists and layouts.
src/storage/    localStorage schema.
```

Two architectural rules worth knowing before you change anything:

**The engine is not in React.** Authoritative game state lives in a plain
class, one `requestAnimationFrame` loop writes to the DOM and the canvases
imperatively, and the HUD subscribes to a snapshot the engine publishes at
about 10Hz. While the player is typing, React renders zero times. If you find
yourself putting entity state into `useState`, stop.

**`engine/` and `analytics/` may not import from `react/`, `ui/`, `render/`,
`input/` or `next/*`.** That boundary is what keeps them testable in a Node
environment, and it is the most valuable constraint in the project.

**Keyboard input arrives on two channels.** Text comes from `beforeinput` on
a hidden input, because that is the only source that is correct for dead keys,
IME commits, autocorrect and Android keyboards. Physical keys come from a
`keydown` listener, because that is the only source of `event.code`, which the
heatmap needs. If you are tempted to simplify this to one listener, read the
comments in `src/input/router.ts` first — both halves are load-bearing.

## Pull requests

- Keep the change focused. One thing per pull request.
- Run `pnpm test && pnpm typecheck && pnpm lint` before pushing.
- Add a test for anything with logic in it. Bug fixes get a test that fails
  before the fix.
- Explain *why*, not just what. The what is in the diff.

## Things that will be declined

- A relic that touches the render loop. Keep `modifiers` and `hooks` data-only.
- A word list without a licence for its source.
- A second accent colour.
- Making the typing surface a canvas. It is real DOM on purpose: canvas text
  discards the accessibility tree, browser zoom, selection and find-in-page,
  and renders softer at the sizes that matter. In a game about reading
  letterforms that trade is not available.
- Binding Tab to restart. It traps keyboard-only and screen-reader users
  inside the play area.
