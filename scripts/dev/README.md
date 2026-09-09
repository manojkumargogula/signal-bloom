# Development scripts

Not part of the build. These drive a real browser against `pnpm dev` so that
changes can be checked against the actual game rather than only against tests.

- `verify.mjs` — plays every mode, decodes real words, measures frame time and
  captures a screenshot of each state. Reports console errors.
- `perf.mjs` — isolates frame cost layer by layer, which is how the shader was
  found to be the entire budget.
- `shots.mjs` — captures the README screenshots. Real captures, because a
  screenshot in a README is a claim about what the software does.
- `draft.mjs` — plays a whole wave to reach the relic draft, which is the
  roguelite mechanic the mode is built around and only appears once a wave is
  cleared.
- `history.mjs` — plays two runs back to back, since the trend only exists
  after the second one.
- `ascent.mjs` — plays the climb: reads the active word from the DOM, asserts
  a single keystroke visibly moves the climber, mistypes on purpose and checks
  it costs one shield without advancing, then climbs a full band to reach the
  relic draft.
- `align.mjs` — measures the climber against the platform it is standing on.
  Written because three separate geometry bugs shipped past both the types and
  the tests: the climber hung under its platform, sat 38px off-centre because
  a percentage `translate` does not resolve on an `<svg>` the way it does on a
  div, and floated 17px up because two different slab heights were hardcoded
  in two places. None of those are visible to a type checker.
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
node scripts/dev/verify.mjs
```

Playwright is a dev dependency; `npx playwright install chromium` once.
