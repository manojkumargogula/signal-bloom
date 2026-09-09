# Development scripts

Not part of the build. These drive a real browser against `pnpm dev` so that
changes can be checked against the actual game rather than only against tests.

These scripts share `lib/climb.mjs`, which knows how to read the active
platform, type it, and end a run. Each of them used to reach for the timed test
when it needed somewhere to type — a fixed body of text with a caret is trivial
to drive — and with one untimed game there is no such surface, so those two
needs live in one place rather than being reinvented six times.

- `ascent.mjs` — plays the climb: reads the active word from the DOM, asserts
  a single keystroke visibly moves the climber, mistypes on purpose and checks
  it costs one shield without advancing, then climbs a full band to reach the
  relic draft. Also measures frame time.
- `perf.mjs` — isolates frame cost layer by layer, which is how the shader was
  found to be the entire budget.
- `shots.mjs` — captures the README screenshots. Real captures, because a
  screenshot in a README is a claim about what the software does.
- `history.mjs` — plays two runs back to back, since the trend only exists
  after the second one. The runs climb different heights on purpose: personal
  bests are keyed on the mode alone, and keying them on run length as well
  put every untimed run in a bucket of its own and left the trend empty.
- `align.mjs` — measures the climber against the platform it is standing on.
  Written because three separate geometry bugs shipped past both the types and
  the tests: the climber hung under its platform, sat 38px off-centre because
  a percentage `translate` does not resolve on an `<svg>` the way it does on a
  div, and floated 17px up because two different slab heights were hardcoded
  in two places. None of those are visible to a type checker.
- `water.mjs` — drives the flood, which is the mode's only fail state. Asserts
  the water is built from its layers with the masks and drifts the browser
  actually applied, that the level is a `transform` and never an inline
  `height`, that it rises once the grace platforms are cleared and warns before
  it kills — and paints all five band palettes at one waterline, so band five
  does not cost sixty platforms to look at. Written because the water shipped
  wrong twice: once as a translucent haze the same hue as the sky it rose
  against, and once with its foam crest set in the app's amber accent on an
  amber sky, which meant the waterline was not drawn at all.
- `onescreen.mjs` — asserts the app is one screen, while playing and after the
  run, at three viewport sizes and for both a counted run and one the game
  refuses to record (which carries an extra notice and is the taller layout).
  The single locked viewport is a stated requirement and the kind that decays
  silently: one panel grows a row, one figure wraps, and the results scroll
  again.
- `repeat.mjs` — holds one key down and asserts exactly one character lands.
- `focus.mjs` — types from every starting focus state, including with focus
  stolen by another element and dropped to the body. Every other test had the
  capture input focused, which is exactly why the "nothing gets typed" bug
  survived all of them.
- `offline.mjs` — proves the offline claim: loads the page, waits for the
  service worker to take control, cuts the network, reloads, and plays. Run
  against the built export rather than the dev server, because the worker only
  registers in production:

  ```bash
  pnpm build && npx serve out -p 4173
  BASE=http://127.0.0.1:4173 node scripts/dev/offline.mjs
  ```

```bash
pnpm dev            # in one terminal
node scripts/dev/ascent.mjs
```

Signal Bloom lands on port 3001 when something else already holds 3000, so pass
`BASE` when it does:

```bash
BASE=http://localhost:3001 node scripts/dev/water.mjs
```

Playwright is a dev dependency; `npx playwright install chromium` once.
