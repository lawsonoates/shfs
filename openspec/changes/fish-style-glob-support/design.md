## Context

`shfs` currently parses glob tokens in the compiler pipeline, but runtime execution explicitly rejects any `ExpandedWord` of kind `glob` via `assertNoUnsupportedGlobs()` in `packages/shfs/src/execute/execute.ts`. Existing subset specs also encode this unsupported behavior. The updated boundary now requires fish-style glob support for in-scope filesystem behavior while preserving out-of-scope constraints (notably symlink-focused behavior).

This change is cross-cutting:
- lexer/parser/compiler word handling (`packages/compiler/src/lexer`, `packages/compiler/src/parser`, `packages/compiler/src/compile`)
- runtime expansion and step execution (`packages/shfs/src/execute/execute.ts`)
- command behaviors for path-taking commands (`ls`, `cd`, `rm`, `touch`, `cp`, `mv`, `mkdir`, and any other in-scope command that consumes path arguments)
- subset specs and OpenSpec requirements

## Goals / Non-Goals

**Goals:**
- Enable fish-style wildcard expansion for unquoted path arguments with support for `*`, `?`, `[ ... ]`, and `**`.
- Preserve quoted wildcard behavior as literal text.
- Support recursive glob semantics, hidden-file semantics, and trailing-slash directory matching semantics expected by fish-style globbing.
- Keep deterministic behavior and deterministic error messaging for failure paths (including no-match cases).
- Ensure out-of-scope exclusions remain enforced even when globs are used.

**Non-Goals:**
- Implementing symlink support or symlink traversal behavior.
- Implementing fish-interactive features (completions, prompt/history, directory stack UX).
- Full fish compatibility across unrelated features.
- Expanding glob semantics into capabilities already excluded by subset boundaries.

## Decisions

### 1. Move from glob rejection to centralized runtime glob expansion
- Decision: Remove `assertNoUnsupportedGlobs()` gating and replace it with a centralized expansion path that resolves each `ExpandedWord` into one or more concrete argument strings before command execution.
- Why: Current execution treats `glob` as a scalar pattern string and then blocks it; full support requires list expansion with deterministic ordering.
- Alternative considered: Expand globs individually inside each command handler (`cd`, `ls`, `rm`, etc.).
- Why not: Duplicates logic, risks command divergence, and makes semantics harder to keep fish-aligned.

### 2. Keep compiler-level word modeling; change runtime expansion shape
- Decision: Keep `ExpandedWord` (`literal`, `glob`, `commandSub`) as-is in compiler IR, but change runtime helpers from scalar-only expansion to list-capable expansion.
- Why: Parser/compiler already preserve enough structure to identify globs. The missing piece is runtime list expansion semantics.
- Alternative considered: Expand globs in compiler phase.
- Why not: Runtime must evaluate against FS and cwd/state at execution time; compile-time expansion is incorrect for dynamic contexts.

### 3. Define command argument cardinality after expansion
- Decision: Validate post-expansion argument cardinality in command handlers where arity matters.
  - Example: `cd` accepts exactly one resolved target path.
  - Multi-arg commands (`rm`, `touch`, `ls`) consume all expanded results.
- Why: A single glob can expand to multiple paths and must be reconciled with each command contract.
- Alternative considered: Reuse pre-expansion arity rules.
- Why not: Produces incorrect behavior when one token expands to many paths.

### 4. Preserve out-of-scope constraints as hard filters
- Decision: Glob expansion must not imply support for excluded features. If a matched path requires excluded semantics (for example symlink traversal behavior), treat it as unsupported according to subset policy.
- Why: Boundary precedence explicitly states out-of-scope constraints override included features.
- Alternative considered: Best-effort pass-through behavior.
- Why not: Would silently broaden subset scope and create inconsistent behavior.

### 5. Align test corpus to fish glob checks within subset limits
- Decision: Update `packages/shfs/src/spec/glob.subset.test.ts` from unsupported-error assertions to behavior assertions derived from fish `tests/checks/glob.fish`, excluding scenarios that depend on out-of-scope features.
- Why: Maintains the established “fish reference narrowed by subset boundary” testing strategy.
- Alternative considered: Design a standalone glob test suite from scratch.
- Why not: Loses traceability to upstream fish behavior.

## Risks / Trade-offs

- [Risk] Glob expansion order differs from fish in edge cases (especially recursive matches). -> Mitigation: define deterministic ordering and assert against fish-derived expectations where subset-applicable.
- [Risk] No-match behavior may vary by command and break scripts unexpectedly. -> Mitigation: standardize and spec explicit no-match behavior per command class (single-target vs multi-target).
- [Risk] `cd` and other single-target commands may receive multiple matches. -> Mitigation: define deterministic failure contract for multi-match ambiguity.
- [Risk] Regression in quoted wildcard literals. -> Mitigation: keep and extend literal-quoted tests for both plain text and path-taking commands.
- [Risk] Existing subset tests rely on unsupported-glob errors. -> Mitigation: update specs/tests in same change, not incrementally.

## Migration Plan

1. Update OpenSpec requirement deltas for `cd-and-glob-subset-contracts` to replace unsupported-glob requirements with fish-style glob requirements.
2. Implement runtime glob expansion pipeline and remove hard rejection checks.
3. Update command-specific argument validation for post-expansion cardinality.
4. Replace/extend subset spec tests to fish-derived behavior assertions constrained by out-of-scope exclusions.
5. Run test suites and fix deterministic output/status mismatches.

Rollback strategy:
- Revert this change set and restore the previous unsupported-glob requirement + tests. The rollback boundary is isolated to glob requirements and argument expansion paths.

## Open Questions

- Which commands are officially classified as “relevant commands” for mandatory glob support in this phase (`ls`, `rm`, `touch`, `cp`, `mv`, `mkdir`, `cd`, `cat`, others)?
- What exact failure contract should apply when a pattern for a single-target command expands to zero or multiple matches?
- Should no-match behavior emulate fish exactly for all in-scope commands, or be deterministic-but-not-verbatim where fish behavior depends on excluded features?
