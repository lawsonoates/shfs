## Why

SHFS currently collapses normal command output and user-facing diagnostics into the same observable output path, which makes the shell API feel less like a real shell and makes tests blur stdout behavior with error reporting. Now that diagnostics have been unified, the next step is to separate stdout and stderr explicitly and expose command completion through `exitCode` terminology that matches shell expectations.

## What Changes

- Add a Bun-aligned shell-output API where awaiting a command returns separate `stdout`, `stderr`, and `exitCode` data without introducing extra result-wrapper methods.
- Route formatted diagnostics to stderr instead of treating them as ordinary stdout line records.
- Preserve stdout as pipeline data only, so diagnostics do not masquerade as pipelineable output.
- Align shell-facing syntax with Bun.$ by preferring awaitable command results, Bun-like output/error objects, and stdout-oriented convenience readers.
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
- API impact: Programmatic `ShellCommand` behavior will move closer to Bun.$ by exposing `stdout`/`stderr`/`exitCode` on awaited results and error objects instead of bespoke helper methods like `result()` or stderr-only readers.
- Behavior impact: Diagnostics will no longer be returned as ordinary stdout records, and tests/assertions that currently consume combined output will need to choose stdout vs stderr intentionally.
- Verification: Shell API tests, fish subset tests using `$status`, and diagnostic end-to-end coverage will need updates.
