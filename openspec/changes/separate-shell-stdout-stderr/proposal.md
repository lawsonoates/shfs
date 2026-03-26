## Why

SHFS currently collapses normal command output and user-facing diagnostics into the same observable output path, which makes the shell API feel less like a real shell and makes tests blur stdout behavior with error reporting. Now that diagnostics have been unified, the next step is to separate stdout and stderr explicitly and expose command completion through `exitCode` terminology that matches shell expectations.

## What Changes

- Add an explicit shell-output API that returns separate `stdout`, `stderr`, and `exitCode` data for programmatic callers.
- Route formatted diagnostics to stderr instead of treating them as ordinary stdout line records.
- Preserve stdout as pipeline data only, so diagnostics do not masquerade as pipelineable output.
- Update shell-facing convenience methods to make stdout/stderr access obvious and reduce reliance on ambiguous combined-output helpers.
- **BREAKING** Rename programmatic status-facing result fields and helpers toward `exitCode` terminology where the API currently exposes command completion state directly.
- Update shell-language status semantics so `$status` reflects the last command's exit code rather than a booleanized success/failure model.

## Capabilities

### New Capabilities
- `shell-output-channels`: Programmatic shell APIs for clearly separated stdout, stderr, and exit-code access.

### Modified Capabilities
- `shell-builtins-and-expansion`: `$status` and command completion semantics change from boolean-style status tracking to full exit-code tracking.
- `shell-diagnostics-and-error-reporting`: Shell-boundary diagnostics are rendered to stderr while preserving deterministic exit-code behavior.

## Impact

- Affected code: `packages/shfs/src/shell/`, `packages/shfs/src/execute/`, `packages/shfs/src/record.ts`, and diagnostic formatting/helpers under `packages/shfs/src/`.
- API impact: Programmatic `ShellCommand` methods and result shapes will gain explicit stdout/stderr separation and prefer `exitCode` naming.
- Behavior impact: Diagnostics will no longer be returned as ordinary stdout records, and tests/assertions that currently consume combined output will need to choose stdout vs stderr intentionally.
- Verification: Shell API tests, fish subset tests using `$status`, and diagnostic end-to-end coverage will need updates.
