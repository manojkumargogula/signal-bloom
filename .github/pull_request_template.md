## What this changes

<!-- And why. The what is visible in the diff; the why is not. -->

## How it was verified

<!-- Which tests, and anything you checked by hand in a browser. -->

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] Played the affected mode in a browser

## If this touches...

- [ ] **A word list** — the source's licence is declared and in the allowlist
- [ ] **A relic** — reads its numbers from a stat, uses `api.rng()` rather than
      `Math.random`, has a behaviour test, and its blurb says concretely what
      changes
- [ ] **Colours** — `pnpm contrast` passes
- [ ] **The engine or analytics** — no import from `react/`, `ui/`, `render/`,
      `input/` or `next/*`
- [ ] **Keyboard handling** — no `preventDefault` on a modifier combination,
      and Tab is still Tab
