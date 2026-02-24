## Context

Step 1 (multi-statement scripts) is already in place, but the subset behavior required by `cd.subset` and `glob.subset` still fails because the shell lacks expansion semantics, core builtins, status-aware chaining, and deterministic `cd`/glob contracts. This change spans parser, compiler command registration, and runtime execution context, so design decisions are needed before implementation.

Current constraints:
- Reuse the existing script AST/IR and execution pipeline introduced in step 1.
- Keep behavior deterministic and test-oriented for the subset scope.
- Avoid broad fish parity work; implement only semantics required by steps 2-8.

## Goals / Non-Goals

**Goals:**
- Parse and execute standalone command substitutions in argument position.
- Support variable expansion needed for `$status` and `set` variables.
- Add builtin command support for `echo`, `set`, `test`, `read`, and `string` in compiler and runtime.
- Execute `and`/`or` statements based on previous statement status.
- Enforce unsupported-glob policy in path-taking commands unless wildcard characters are quoted.
- Align `cd` error and status behavior with deterministic subset expectations.

**Non-Goals:**
- Full fish language support beyond subset tests.
- Adding unrelated builtins or control-flow constructs.
- Redesigning record/stream abstractions outside what is needed for this behavior.

## Decisions

1. Add explicit runtime state to execution context (`cwd`, `status`, global vars, run-local vars).
- Why: chaining, `$status`, and `set -l` need shared per-run state that survives across script statements but not across separate shell invocations.
- Alternative considered: keep state in `Shell` only and thread manually. Rejected because execution decisions (`and`/`or`, builtin side effects) happen in executor, not shell wrapper.

2. Implement builtins as compiler-recognized commands with dedicated IR steps.
- Why: current command registry throws `Unknown command`; first-class steps let runtime enforce predictable semantics and status behavior.
- Alternative considered: fallback generic builtin dispatcher without IR step types. Rejected due to weaker typing and harder testability.

3. Evaluate statement `chainMode` in script executor before running a statement.
- Why: step 1 already models `always|and|or`; execution should now consult prior `status` to decide whether to run each statement.
- Alternative considered: compile `and`/`or` into synthetic commands. Rejected because semantics are statement-level flow control, not command execution.

4. Perform glob-policy validation before path resolution for affected commands (`ls`, `cd`, `rm`, `touch`, and other path-taking subset commands).
- Why: tests require unsupported wildcard rejection, but quoted wildcard text should remain literal.
- Alternative considered: rely on FS glob resolution and infer unsupported patterns from misses. Rejected because misses are ambiguous and produce wrong error contracts.

5. Normalize `cd` contracts in one place (requested path validation + deterministic messages + status update on failure).
- Why: current behavior leaks generic missing-path messages and treats empty path as current directory.
- Alternative considered: patch only `cd` operator. Rejected because `cd` semantics here are implemented in executor path handling.

## Risks / Trade-offs

- [State-model complexity increases executor coupling] -> Mitigation: keep a small typed context interface and isolate variable/status helpers.
- [Parser changes for substitutions or variable tokens may regress existing tokenization] -> Mitigation: add targeted lexer/parser tests for standalone `(...)`, nested substitutions, and quoted wildcard literals.
- [Builtin semantics could drift from subset expectations] -> Mitigation: codify behavior through the provided subset specs before wider command support.
- [Glob validation might block legitimate literal paths] -> Mitigation: honor quote metadata from parser tokens and validate only unquoted wildcard patterns.

## Migration Plan

1. Extend parser/word handling for standalone command substitution arguments and variable expansion tokens.
2. Extend IR and compiler command handlers for `echo`, `set`, `test`, `read`, `string`.
3. Extend executor context with status and scoped variables; wire builtin step execution.
4. Activate statement `and`/`or` execution gating using prior status.
5. Add glob-policy guards for path-taking commands and implement deterministic unsupported errors.
6. Align `cd` empty-path/missing-dir behavior and failure status updates.
7. Run subset tests and supporting unit tests; iterate until green.

Rollback:
- Revert this change set as a unit to restore step-1 baseline behavior.

## Open Questions

- Should unsupported wildcard errors use one canonical message across all commands or command-specific prefixes with shared keywords?
- Should `read` capture only the first line from pipeline input or join all incoming line records in this subset?
