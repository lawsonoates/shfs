# notes on fish subset tests

- `spec/` contains only tests ported or adapted from an upstream specification suite.
- Every test ported or adapted from fish-shell belongs under `spec/fish/`: https://github.com/fish-shell/fish-shell
- Organize tests by upstream file. For example, `glob.subset.test.ts` corresponds only to `tests/checks/glob.fish` upstream.
- Derive the local filename mechanically from the upstream basename, converting underscores to kebab-case when Ultracite requires it. For example, `fish_add_path.fish` maps to `fish-add-path.subset.test.ts`.
- Do not combine cases from multiple upstream files in one subset test file.
- Put shfs-only regressions with no direct upstream case outside `spec/`.
- The tests are a subset of fish which is defined by notes/shfs-subset-boundary.md
