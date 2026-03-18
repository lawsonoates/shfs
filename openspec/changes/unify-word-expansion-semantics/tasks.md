## 1. Expansion Contract Alignment

- [ ] 1.1 Audit the current runtime expansion call sites in `packages/shfs/src/execute/path.ts`, `packages/shfs/src/execute/redirection.ts`, `packages/shfs/src/execute/execute.ts`, and `packages/shfs/src/operator/grep/grep.ts` to confirm every place that still converts `ExpandedWord` values outside the shared evaluator.
- [ ] 1.2 Lock the redirection-specific single-target and no-match error expectations needed by the spec delta before refactoring call sites.

## 2. Shared Evaluator Refactor

- [ ] 2.1 Refactor `packages/shfs/src/execute/path.ts` so scalar, list, and single-path resolution flow through one underlying runtime word evaluator.
- [ ] 2.2 Add thin helpers for single-target path consumers and keep redirect presence checks separate from async redirect target resolution.

## 3. Redirection Consumer Migration

- [ ] 3.1 Replace `expandedWordToString()`-based redirection target resolution in `packages/shfs/src/execute/redirection.ts` with async shared evaluation.
- [ ] 3.2 Update `packages/shfs/src/execute/execute.ts` to await shared input/output redirection targets without changing sink-detection behavior.
- [ ] 3.3 Migrate `packages/shfs/src/operator/grep/grep.ts` and any remaining redirection-aware runtime consumers to the shared evaluator contract.

## 4. Regression Coverage And Validation

- [ ] 4.1 Add execution tests covering variable-expanded input and output redirection targets.
- [ ] 4.2 Add regression tests covering command-substitution redirection targets plus ambiguous or no-match redirection expansion failures.
- [ ] 4.3 Run targeted Bun tests for `packages/shfs` and `packages/compiler`, then fix any regressions introduced by the evaluator consolidation.
