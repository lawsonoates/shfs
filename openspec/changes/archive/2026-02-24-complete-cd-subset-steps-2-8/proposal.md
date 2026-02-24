## Why

The subset tests still fail after multi-statement script support because critical shell semantics from steps 2-8 are missing. Completing these semantics now is required to make `cd`-centric workflows behave predictably and pass the target spec suite.

## What Changes

- Add parser support for standalone command substitution arguments (for example `cd (echo subdir)`), including nested substitutions.
- Add variable expansion support needed for `$status` and user-defined variables in command arguments.
- Introduce missing builtins used by the subset tests: `echo`, `set`, `test`, `read`, and `string`.
- Implement runtime state for global variables, run-scoped local variables, and command status propagation.
- Activate statement chain semantics for `and` and `or` based on prior command status.
- Enforce subset glob policy by rejecting unquoted wildcard usage in path-taking commands with deterministic unsupported-glob errors.
- Align `cd` behavior with expected deterministic contracts for missing directories, empty paths, and failure status updates.

## Capabilities

### New Capabilities

- `shell-builtins-and-expansion`: Builtin commands, variable expansion, command substitution arguments, and runtime status/variable state required by the subset tests.
- `cd-and-glob-subset-contracts`: Deterministic `cd` error/status behavior and unsupported wildcard policy for the subset command set.

### Modified Capabilities

- `script-statement-execution`: Statement chain metadata moves from structural-only representation to executable `and`/`or` control semantics.

## Impact

- Affected compiler layers: lexer/parser word handling, command parsing, command handler registry, and AST/IR statement chain semantics.
- Affected runtime layers: execute context model, builtin execution paths, chain evaluation, and path/glob validation for path-taking commands.
- Affected tests: `packages/shfs/src/spec/cd.subset.test.ts` and `packages/shfs/src/spec/glob.subset.test.ts`, plus supporting compiler/execute unit tests.
- No external dependency additions required.
