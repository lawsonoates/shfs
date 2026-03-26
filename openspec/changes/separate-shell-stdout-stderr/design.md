## Context

SHFS currently treats formatted diagnostics as ordinary line output at the shell boundary. That works for basic rendering, but it blurs stdout and stderr in the public API, makes pipeline-oriented record types pull double duty as error channels, and forces tests to infer exit state indirectly through combined text or `$status`.

This change is cross-cutting. It touches the shell API, execution result flow, diagnostic formatting, stdout record abstractions, and tests that currently assume one combined observable channel. The design needs to make stdout/stderr separation obvious in both code and API shape without destabilizing command execution or breaking shell-language semantics such as `$status`.

## Goals / Non-Goals

**Goals:**
- Give the programmatic shell API explicit stdout, stderr, and `exitCode` concepts.
- Keep stdout as pipeline data and move formatted diagnostics to stderr.
- Make the stdout/stderr separation obvious in code structure so future changes do not accidentally re-mix the channels.
- Preserve deterministic exit-code behavior and expose it consistently through both programmatic results and shell-language `$status`.
- Provide a migration path for existing ambiguous helpers such as combined text accessors.

**Non-Goals:**
- Introduce real OS-level file descriptor semantics or shell redirection syntax for stderr in this change.
- Rewrite every operator around a new streaming primitive if a narrower boundary refactor can preserve behavior.
- Remove `$status` from the shell language.
- Define stable public APIs for arbitrary non-line stderr records beyond formatted diagnostics.

## Decisions

### 1. Separate stdout and stderr at the shell/execution boundary

Execution results will distinguish stdout and stderr explicitly instead of representing both as one stream of generic records. Stdout remains the channel for pipelineable records (`file`, `line`, `json`), while stderr becomes a separate line-oriented channel used for formatted diagnostics and other user-facing error text.

This keeps pipeline semantics clean and prevents downstream commands from consuming diagnostics as ordinary input.

Alternative considered: add a `channel` field to existing records and keep one combined stream. Rejected because it would force every pipeline consumer to understand and ignore stderr records correctly, which weakens the separation and increases accidental coupling.

### 2. Add an explicit shell API result shape with `exitCode`

The public shell API will expose a structured result with separate `stdout`, `stderr`, and `exitCode` fields, plus convenience helpers that are explicit about which channel they read. `exitCode` is preferred over `status` for programmatic APIs because it reads as shell-native completion state instead of a boolean-ish success indicator.

The shell language still keeps `$status`, but its value will reflect the last command's exit code rather than a narrowed 0/1 model.

Alternative considered: keep existing convenience methods only and infer stderr internally. Rejected because the ambiguity in the current API is part of the problem being addressed.

### 3. Make the separation visible in file structure and abstractions

Stdout record definitions and stderr/diagnostic formatting helpers should live in clearly separated modules. The implementation should make it obvious which types are pipeline data and which types are shell-boundary error output. A likely structure is:
- stdout record types/helpers
- stderr line helpers / diagnostic rendering helpers
- execute result types that combine both channels
- shell API adapters built on top of those result types

Alternative considered: keep current file layout and rely only on naming within existing modules. Rejected because the user-facing confusion is mirrored in the current abstraction layout; stronger structural separation lowers future maintenance risk.

### 4. Preserve compatibility through transitional convenience methods

Existing helpers such as `text()` and `lines()` may remain temporarily, but the design should define them as compatibility shims rather than the primary interface. New call sites and tests should prefer explicit stdout/stderr methods or the structured result object.

Alternative considered: remove ambiguous helpers immediately. Rejected because it would turn a boundary-improvement change into a broader migration than necessary.

## Risks / Trade-offs

- **[API churn for tests and callers]** -> Mitigation: add explicit new methods/result shapes first, keep compatibility helpers during migration, and update tests in focused batches.
- **[Boundary refactor leaks stderr into pipeline execution]** -> Mitigation: keep stderr out of stdout record unions and ensure execute-result types model two channels rather than one tagged stream.
- **[Exit-code semantics expose inconsistencies across commands]** -> Mitigation: codify the expected behavior in specs and update `$status` tests alongside the new shell API tests.
- **[Duplicate formatting paths emerge during migration]** -> Mitigation: centralize stderr formatting through the diagnostic helpers and keep shell-boundary rendering in one place.

## Migration Plan

1. Introduce explicit execute/shell result types that carry `stdout`, `stderr`, and `exitCode`.
2. Move diagnostic formatting onto the stderr channel while keeping existing command execution semantics intact.
3. Add explicit shell convenience methods for stdout-only and stderr-only retrieval.
4. Update `$status` handling to reflect full exit-code semantics.
5. Migrate tests from combined-output assumptions to explicit stdout/stderr assertions, keeping compatibility helpers only as transitional adapters.

## Open Questions

- Should `text()` mean stdout-only immediately, or remain a temporary combined-output helper until callers are migrated?
- Should stderr remain line-oriented for now, or should the design reserve room for richer diagnostic records later?
- How much of the internal `execute` API should become channel-aware in the first pass versus staying adapted at the shell boundary?
