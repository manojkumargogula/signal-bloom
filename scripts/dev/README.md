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
