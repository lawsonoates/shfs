## 1. Spec Alignment

- [ ] 1.1 Review and finalize the `cd-and-glob-subset-contracts` delta to confirm fish-style glob requirements and out-of-scope precedence language.
- [ ] 1.2 Confirm command scope for "relevant path-taking commands" and record that scope in the spec/design artifacts before coding.

## 2. Runtime Glob Expansion Core

- [ ] 2.1 Refactor runtime word evaluation to support list-producing expansion for `glob` words instead of scalar-only expansion.
- [ ] 2.2 Remove `assertNoUnsupportedGlobs()` command gating and route path arguments through the new glob expansion path.
- [ ] 2.3 Implement deterministic no-match handling and deterministic ordering for expanded match results.

## 3. Command Semantics After Expansion

- [ ] 3.1 Update single-target command validation (`cd` and any other single-target path commands) to enforce post-expansion cardinality.
- [ ] 3.2 Update multi-target path-taking commands (`ls`, `rm`, `touch`, `cp`, `mv`, `mkdir`, and in-scope peers) to consume expanded argument lists.
- [ ] 3.3 Preserve quoted wildcard literals and verify they bypass glob expansion in path arguments.

## 4. Fish-Style Behavior Coverage

- [ ] 4.1 Implement and verify `**` recursive glob behavior for in-scope filesystem traversal semantics.
- [ ] 4.2 Implement and verify hidden-file matching behavior consistent with fish-style wildcard rules.
- [ ] 4.3 Implement and verify trailing-slash directory-only wildcard behavior.
- [ ] 4.4 Enforce out-of-scope precedence so symlink-focused behavior remains unsupported even when glob patterns are used.

## 5. Tests and Validation

- [ ] 5.1 Replace unsupported-glob assertions in `packages/shfs/src/spec/glob.subset.test.ts` with fish-derived behavior tests that remain in subset scope.
- [ ] 5.2 Add/adjust command-level tests for post-expansion cardinality, no-match failure, and quoted-literal wildcard behavior.
- [ ] 5.3 Run targeted package tests (`packages/compiler` and `packages/shfs`) and fix regressions introduced by glob expansion changes.
