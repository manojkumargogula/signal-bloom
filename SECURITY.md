# Security policy

## The threat surface

Signal Bloom has no server, no database, no authentication and no user
accounts. It collects no personal data and makes no network requests after the
page has loaded. That removes most of what a security policy usually covers,
and leaves three things that genuinely matter:

**Supply chain.** The dependency tree is the largest risk here by a wide
margin. Installs are `--frozen-lockfile`, Dependabot is enabled, and CI runs
on every pull request.

**Malicious contributed content.** Word lists, quotations and themes arrive as
data files from contributors. Word list text is rendered as `textContent` and
never as HTML, so a list cannot inject markup. Theme values are validated
before being written to a CSS custom property.

**Storage migration.** A bug in the localStorage schema could destroy a
player's run history. Reads are wrapped and fall back to defaults rather than
throwing, and the stored shape is versioned.

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/manojkumargogula/signal-bloom/security/advisories/new)
rather than opening a public issue.

Include what you found, how to reproduce it, and what you think the impact is.
You will get an acknowledgement within a few days. There is no bounty — this
is an unfunded side project — but you will be credited in the fix unless you
would rather not be.

## Supported versions

The `main` branch and the currently deployed site. There are no long-term
support branches.
