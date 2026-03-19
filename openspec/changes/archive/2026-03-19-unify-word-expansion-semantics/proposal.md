## Why

Runtime word expansion is currently split across two paths: normal command arguments use the shared evaluator in `packages/shfs/src/execute/path.ts`, while redirection targets are still stringified directly in `packages/shfs/src/execute/redirection.ts`. That split creates semantic drift today and will get riskier after multipart words become more real in the compiler pipeline, because more runtime call sites will need to agree on how literals, variables, command substitutions, and globs become concrete values.

## What Changes

- Route redirection target evaluation through the same runtime word-expansion subsystem used for command arguments and builtin operands.
- Define one consistent runtime contract for how `ExpandedWord` values resolve into scalar or list values, including how single-target contexts reject ambiguous multi-value expansion.
- Update execution paths that currently read redirection targets as raw strings so input and output redirections honor variable expansion, command substitution, and any future multipart-word behavior the same way other runtime consumers do.
- Add requirement coverage for consistent expansion semantics across command arguments and redirection targets, including deterministic failure behavior where a context requires exactly one resolved path.
- Add regression tests covering shared expansion behavior instead of per-call-site behavior.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `shell-builtins-and-expansion`: Expand the runtime contract so word evaluation semantics apply consistently to both command arguments and redirection targets, with deterministic behavior for variable expansion, command substitution, and single-target path resolution.

## Impact

- Affected specs: `openspec/specs/shell-builtins-and-expansion/spec.md`
- Affected code areas (expected): `packages/shfs/src/execute/path.ts`, `packages/shfs/src/execute/redirection.ts`, `packages/shfs/src/execute/execute.ts`, builtin/runtime consumers that currently mix scalar and list evaluation helpers, and any redirection-aware operators such as `grep`.
- Affected tests: execution and builtin/runtime tests covering argument expansion, redirection handling, and command-substitution/variable-expansion behavior.
- No new external dependencies are expected; this change is primarily a runtime contract consolidation ahead of further compiler/runtime cleanup.
