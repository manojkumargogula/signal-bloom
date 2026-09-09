# Development scripts

Not part of the build. These drive a real browser against `pnpm dev` so that
changes can be checked against the actual game rather than only against tests.

- `verify.mjs` — plays every mode, decodes real words, measures frame time and
  captures a screenshot of each state. Reports console errors.
- `perf.mjs` — isolates frame cost layer by layer, which is how the shader was
  found to be the entire budget.
- `shots.mjs` — captures the README screenshots. Real captures, because a
  screenshot in a README is a claim about what the software does.

```bash
pnpm dev            # in one terminal
node scripts/dev/verify.mjs
```

Playwright is a dev dependency; `npx playwright install chromium` once.
