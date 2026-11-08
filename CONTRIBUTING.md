# Contributing

## Development

Install dependencies and rebuild the bundled action code before opening a pull request:

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit:coverage
npm run build
```

This repository ships the generated action bundle in `lib/`, so changes to `src/main.ts`
should include the corresponding updated files under `lib/`.

CI builds with Node 26 and also tests Node 24, the runtime declared by `action.yml`.
The build first compiles with TypeScript 7.0.2 (installed as the npm alias
`@typescript/native`), then bundles the emitted JavaScript with ncc. Calling ncc
directly on TypeScript fails because its ts-loader expects the old compiler API.
TypeScript 6.0.3 is retained only for typescript-eslint's supported compiler API
(its peer range is `<6.1.0`); build/typecheck scripts explicitly invoke version 7
instead of relying on the ambiguous `tsc` bin shared by the two packages.

The minimatch override upgrades affected 7–11.0.0 releases to 11.0.5 to address
GHSA-g3hv-75wg-m249. Older unaffected minimatch releases are not overridden.
`@actions/glob` 0.7.0 requires vulnerable minimatch 10 and calls `matchOne`, which
minimatch 11 removed. The cache-scoped override temporarily uses glob 0.6.1 and
its unaffected minimatch 3 instead; forcing minimatch 11 there breaks cache path
traversal. This deliberate transitive downgrade keeps cache 6.3.0 and is covered
by a recursive include/exclude glob regression test. Remove these overrides when
upstream releases compatible fixes; do not blindly override cache's minimatch.

`npm audit` (including development dependencies) must be clean. The former
`action-docs` dependency pulled in Showdown with GHSA-rmmh-p597-ppvv,
GHSA-cr32-g25g-vxjj and GHSA-22g5-r2x5-97cx. The repository-specific
`scripts/generate-docs.mjs` replaces it without a Markdown-to-HTML renderer.
Run `npm run docs` after changing `action.yml`; it updates only the existing
input/output README markers. Descriptions retain inline Markdown, while raw
HTML and table separators are escaped. CI checks the generated tables for drift.

`npm run test:fuzz` runs the fast-check input properties (also included in the
normal unit/coverage suite). Five properties each run 1,000 generated examples
with seed `20261108`, covering literal archive suffixes, custom extensions,
platform/architecture escaping, trailing line endings and digest mismatches.
On failure, fast-check reports the seed, replay path and shrunk counterexample;
replay with those `seed`/`path` options and keep the example as a regression.
These are bounded property tests, not continuous coverage-guided fuzzing of
archive extraction or third-party parsers. Scorecard v5.6.0 recognizes fast-check
imports, but default-branch detection still requires a post-merge rescan.

## Pull Requests

Keep pull requests focused and include a short description of the user-visible change.
If you change action inputs or behavior, update `README.md` to match.

## Security

Please do not open public issues for security vulnerabilities. Follow `SECURITY.md` for
private reporting instructions.
