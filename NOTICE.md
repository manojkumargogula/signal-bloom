# Notices and attribution

Code in this repository is MIT licensed. See [LICENSE](LICENSE).

## Fonts

Both faces are licensed under the SIL Open Font License 1.1 and are
self-hosted by `next/font` at build time, so the deployed site makes no
request to a third-party font origin.

- **Chakra Petch** — © Cadson Demak — OFL-1.1 —
  <https://fonts.google.com/specimen/Chakra+Petch>
- **JetBrains Mono** — © JetBrains s.r.o. — OFL-1.1 —
  <https://www.jetbrains.com/lp/mono/>

## Artwork

`assets/brand/*.svg`, `src/app/icon.svg` and everything generated from them in
`public/icons/` are original work by the project authors, MIT licensed. There
are no stock images, no icon fonts and no third-party artwork in this
repository.

The background is a WebGL fragment shader in
`src/render/webgl/shaders.ts` — procedural rather than a texture, so it ships
as source rather than as an asset.

## Word lists and quotations

Every corpus in `src/data/` declares its source and licence, and a test
asserts that the licence is on an allowlist. The English word lists are drawn
from public-domain frequency data; the quotations are out of copyright and
each carries its attribution. See
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-word-list) before adding a list —
the licence of the corpus you sourced it from is a required field, and it is
the easiest way for a project like this to accidentally ingest someone else's
copyright.

## Metric definitions

The consistency mapping matches the one Monkeytype uses, so that a consistency
score here means the same thing as a consistency score there. The formula is
written out at `/metrics`.
