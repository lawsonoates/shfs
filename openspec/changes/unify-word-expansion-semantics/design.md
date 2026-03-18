## Context

`shfs` already has a meaningful runtime expansion boundary in `packages/shfs/src/execute/path.ts`, but it is not the only place where IR words become runtime values. Normal command arguments, builtin operands, and path-taking command operands use async evaluation helpers, while redirection targets are still read synchronously with `expandedWordToString()` in `packages/shfs/src/execute/redirection.ts`. `grep` also mixes shared evaluation helpers with raw redirection-path reads.

That split is manageable while `ExpandedWord` values are mostly single-part literals, but it becomes a liability for the PR sequence described in `notes/compiler-improvement-prs.note`: improvement #2 is supposed to consume the richer word structure unlocked by PR 1, and it only pays off if runtime consumers stop inventing their own conversion rules. This change therefore needs to tighten the runtime execution boundary without changing the compiler contract yet.

## Goals / Non-Goals

**Goals:**
- Introduce one shared runtime word-evaluation contract that can serve command arguments, builtin operands, path operands, and redirection targets.
- Make single-target contexts explicit so redirections and destination operands fail deterministically when expansion yields zero or multiple concrete paths.
- Preserve current behavior for existing argument consumers while extending the same semantics to redirections.
- Keep the implementation compatible with the current `ExpandedWord` IR shape and easy to adapt when multipart words become more real upstream.
- Add integration tests that protect against future semantic drift between execution call sites.

**Non-Goals:**
- Changing the compiler IR or parser representation in this change.
- Reworking command-option parsing in `@shfs/compiler`.
- Solving the separate command-substitution execution-cycle cleanup from improvement #6.
- Broadening subset scope beyond shared evaluation semantics for existing runtime contexts.

## Decisions

### 1. Consolidate runtime evaluation behind one cardinality-aware API
- Decision: Refactor `packages/shfs/src/execute/path.ts` so there is one underlying evaluator that resolves an `ExpandedWord` into runtime values, with thin helpers for the common consumption modes:
  - scalar text (`exactly one string`)
  - repeated values (`zero or more strings`)
  - single path (`exactly one path, then resolve relative to cwd`)
- Why: The current helper split (`evaluateExpandedWord`, `evaluateExpandedWords`, `evaluateExpandedPathWord`, `evaluateExpandedPathWords`) mixes value evaluation with call-site expectations. A cardinality-aware contract makes those expectations explicit and gives redirections the same semantics without duplicating logic.
- Alternative considered: Keep the existing helpers and add a new async redirection-specific evaluator.
- Why not: That would preserve multiple authority paths and make future multipart-word support harder to land consistently.

### 2. Separate redirect presence checks from redirect target evaluation
- Decision: Keep a synchronous structural helper for “does this step declare an input/output redirect?” and replace synchronous target resolution with an async helper that evaluates the redirect word using the shared runtime evaluator.
- Why: `execute.ts` needs to know whether a pipeline is a sink before any runtime work starts, but the concrete redirect path depends on cwd, variables, command substitution, and filesystem-backed expansion rules.
- Alternative considered: Make pipeline sink detection itself async and evaluate redirect targets up front.
- Why not: It would complicate control flow and mix structural execution planning with runtime evaluation unnecessarily.

### 3. Resolve paths after evaluation, not inside the compiler contract
- Decision: Shared evaluation should produce runtime strings first; path-aware consumers then normalize those results relative to cwd in the execution layer.
- Why: Builtins like `echo`, `set`, and `string` still need plain text semantics, while redirections, `cd`, `cp`, and other filesystem consumers need path normalization. Keeping those stages separate matches the current architecture and avoids forcing all evaluators into path-only behavior.
- Alternative considered: Have the shared evaluator always emit absolute paths for any word used in execution.
- Why not: That would blur text evaluation with filesystem semantics and make non-path consumers awkward.

### 4. Migrate all redirection-aware runtime consumers in the same change
- Decision: Update `packages/shfs/src/execute/redirection.ts`, stream/effect execution in `packages/shfs/src/execute/execute.ts`, and redirection-aware operator code such as `packages/shfs/src/operator/grep/grep.ts` to consume the shared evaluator.
- Why: Leaving `grep` or other redirection-aware consumers on raw stringification would keep the semantic split alive and weaken the whole point of improvement #2.
- Alternative considered: Limit the refactor to the main execute pipeline and defer operator-specific cleanup.
- Why not: Hidden drift would remain in redirection conflict checks and file operand handling.

### 5. Standardize single-target error contracts for redirections
- Decision: Treat redirection targets as single-target path contexts. If evaluation produces zero matches or more than one resolved path, execution fails deterministically using the same expansion rules as other single-path consumers.
- Why: Redirections ultimately need exactly one concrete file target. Making that rule explicit keeps behavior aligned with `cd`, `cp` destinations, and `mv` destinations.
- Alternative considered: Preserve legacy stringification for ambiguous words and let downstream file operations fail later.
- Why not: That would reintroduce semantic drift and make failures depend on accident rather than the expansion contract.

### 6. Prefer integration-heavy regression coverage
- Decision: Add or update tests around `execute()` and `grep` execution paths for variable-expanded redirects, command-substitution redirects, and ambiguous redirection failures, rather than relying only on helper-level tests.
- Why: The risk here is not just wrong helper output; it is different call sites quietly bypassing the shared evaluator.
- Alternative considered: Add only unit tests around the new evaluator helpers.
- Why not: That would not catch a runtime consumer continuing to call `expandedWordToString()`.

## Risks / Trade-offs

- [Risk] Async redirect resolution introduces more async plumbing into execution code paths. -> Mitigation: keep presence checks synchronous and isolate async work to concrete target resolution helpers.
- [Risk] Some scripts may start failing earlier when a redirect target expands ambiguously instead of being stringified. -> Mitigation: define and test deterministic single-target failure behavior in the spec and execution tests.
- [Risk] `grep` or other operators may still hide direct string conversions outside the main execute path. -> Mitigation: audit current redirection-aware consumers during implementation and add regression tests at those integration points.
- [Risk] This refactor could entrench the current `ExpandedWord` shape right before multipart words evolve. -> Mitigation: keep the API centered on “evaluate runtime word into values” rather than on literal/glob/command-sub switch logic at each call site.

## Migration Plan

1. Update the `shell-builtins-and-expansion` delta spec to make shared redirection-target evaluation part of the runtime contract.
2. Refactor runtime evaluation helpers so scalar, list, and single-path resolution all flow through one underlying evaluator.
3. Replace synchronous redirection target stringification with async shared resolution in `execute.ts`, `redirection.ts`, and `grep.ts`.
4. Add regression coverage for variable-expanded, command-substituted, and ambiguous redirection targets.
5. Run targeted `packages/shfs` and `packages/compiler` tests to confirm no behavior regressions around existing argument expansion flows.

Rollback strategy:
- Revert the evaluator consolidation and restore direct redirection stringification, along with the corresponding spec delta and redirection-focused tests.

## Open Questions

- None at this time.
