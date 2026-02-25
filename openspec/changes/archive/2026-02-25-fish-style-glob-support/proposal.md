## Why

The current subset contract explicitly rejects unquoted wildcards, which blocks common filesystem workflows and diverges from expected fish command behavior. Now that the boundary decision has been updated to include fish-style globbing, the spec suite and implementation contract need to be realigned.

## What Changes

- Replace the current unsupported-glob subset contract with fish-style glob expansion semantics for relevant filesystem command arguments.
- Define supported wildcard behavior for `*`, `?`, `[ ... ]`, and `**`, including recursive matching, hidden-file behavior, and trailing-slash directory matching.
- Preserve literal behavior for quoted wildcard characters.
- Keep out-of-scope exclusions in force (notably symlink-focused behavior): globbing must not implicitly enable excluded capabilities.
- Confirm in-scope path-taking command coverage for this change: `cd`, `ls`, `rm`, `touch`, `cp`, `mv`, `mkdir`, `cat`, `head`, and `tail`.
- Update subset tests/spec expectations from "unsupported glob" failures to deterministic fish-style match behavior where features are in-scope.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `cd-and-glob-subset-contracts`: Replace unsupported wildcard rejection requirements with fish-style glob expansion requirements, while preserving explicit out-of-scope exclusions (for example symlink behavior).

## Impact

- Affected specs: `openspec/specs/cd-and-glob-subset-contracts/spec.md`
- Affected code areas (expected): parser/token classification, argument expansion pipeline, filesystem path matching, and command operators that consume path arguments (`ls`, `cd`, `rm`, `touch`, and other path-taking commands in scope).
- Affected tests: subset specs under `packages/shfs/src/spec/` currently asserting unsupported wildcard errors.
- No new external dependencies required; behavior is constrained by existing subset boundaries and deterministic error expectations.
