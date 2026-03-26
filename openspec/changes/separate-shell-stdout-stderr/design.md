## Context

SHFS currently treats formatted diagnostics as ordinary line output at the shell boundary. That works for basic rendering, but it blurs stdout and stderr in the public API, makes pipeline-oriented record types pull double duty as error channels, and forces tests to infer exit state indirectly through combined text or `$status`.

This change is cross-cutting. It touches the shell API, execution result flow, diagnostic formatting, stdout record abstractions, and tests that currently assume one combined observable channel. The design needs to make stdout/stderr separation obvious in both code and API shape without destabilizing command execution or breaking shell-language semantics such as `$status`. It also needs to avoid introducing public shell syntax that drifts from Bun.$ when a Bun-like surface can be preserved.

## Goals / Non-Goals

**Goals:**
- Give the programmatic shell API explicit stdout, stderr, and `exitCode` concepts.
- Keep the public shell syntax close to Bun.$ so callers can transfer expectations directly.
- Keep stdout as pipeline data and move formatted diagnostics to stderr.
- Make the stdout/stderr separation obvious in code structure so future changes do not accidentally re-mix the channels.
- Preserve deterministic exit-code behavior and expose it consistently through both programmatic results and shell-language `$status`.
- Provide a migration path for existing ambiguous helpers such as combined text accessors without adding new long-term public helpers that Bun does not have.

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

The public shell API will expose a structured result with separate `stdout`, `stderr`, and `exitCode` fields, but it should do so through a Bun-like awaitable command object rather than through a bespoke `result()` method. `exitCode` is preferred over `status` for programmatic APIs because it reads as shell-native completion state instead of a boolean-ish success indicator.

Awaiting a command should yield a `ShellOutput`-like object. Non-zero exit codes should throw a `ShellError`-like error by default, with opt-out controls modeled after Bun (`nothrow()` / `throws(false)`). Stdout/stderr inspection should happen through the output object or error object, not through public stderr-only helper methods such as `stderrText()` or `stderrLines()`.

The shell language still keeps `$status`, but its value will reflect the last command's exit code rather than a narrowed 0/1 model.

Alternative considered: add a bespoke `result()` method and stderr-only helper methods. Rejected because that introduces a shell-specific syntax that users do not expect if the goal is Bun.$ parity.

### 3. Make the separation visible in file structure and abstractions

Stdout record definitions and stderr/diagnostic formatting helpers should live in clearly separated modules. The implementation should make it obvious which types are pipeline data and which types are shell-boundary error output. A likely structure is:
- stdout record types/helpers
- stderr line helpers / diagnostic rendering helpers
- execute result types that combine both channels
- shell API adapters built on top of those result types

Alternative considered: keep current file layout and rely only on naming within existing modules. Rejected because the user-facing confusion is mirrored in the current abstraction layout; stronger structural separation lowers future maintenance risk.

### 4. Preserve compatibility through transitional convenience methods

Existing helpers such as `text()` may remain, but only when they match Bun semantics closely. `text()` should remain a stdout-oriented reader, while `lines()` should move toward Bun's async-iterable behavior. New call sites and tests should prefer Bun-like awaiting for structured access and Bun-like stdout reader methods for convenience. Public helpers with no Bun analogue, such as `result()` or `stderrLines()`, should not remain part of the long-term surface.

Alternative considered: remove ambiguous helpers immediately. Rejected because it would turn a boundary-improvement change into a broader migration than necessary.

## Risks / Trade-offs

- **[API churn for tests and callers]** -> Mitigation: align directly to Bun-style syntax instead of introducing intermediate helper methods that would need a second migration.
- **[Boundary refactor leaks stderr into pipeline execution]** -> Mitigation: keep stderr out of stdout record unions and ensure execute-result types model two channels rather than one tagged stream.
- **[Exit-code semantics expose inconsistencies across commands]** -> Mitigation: codify the expected behavior in specs and update `$status` tests alongside the new shell API tests.
- **[Duplicate formatting paths emerge during migration]** -> Mitigation: centralize stderr formatting through the diagnostic helpers and keep shell-boundary rendering in one place.

## Migration Plan

1. Introduce explicit execute/shell result types that carry `stdout`, `stderr`, and `exitCode`.
2. Move diagnostic formatting onto the stderr channel while keeping existing command execution semantics intact.
3. Adapt the shell boundary to Bun-like awaitable command results and Bun-like error objects.
4. Keep only Bun-aligned convenience readers such as `text()` and `json()`, and remove bespoke result/stderr helper methods from the public API.
5. Update `$status` handling to reflect full exit-code semantics.
6. Migrate tests from combined-output assumptions and bespoke helpers to Bun-like result/error inspection.

## Open Questions

- Should `text()` mean stdout-only immediately, or remain a temporary combined-output helper until callers are migrated?
- Should stderr remain line-oriented for now, or should the design reserve room for richer diagnostic records later?
- How much of the internal `execute` API should become channel-aware in the first pass versus staying adapted at the shell boundary?
- Which Bun.$ affordances should be implemented in the first parity pass beyond awaitability, `text()`, `json()`, `lines()`, `quiet()`, and throw-control helpers?
