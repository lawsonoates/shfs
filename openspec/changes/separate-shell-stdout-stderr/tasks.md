## 1. Output Channel Abstractions

- [x] 1.1 Define explicit execute/shell result types that separate stdout, stderr, and `exitCode`
- [x] 1.2 Split stdout record abstractions from stderr/diagnostic output helpers in the SHFS module structure
- [x] 1.3 Add shell-level collection/formatting helpers for stdout-only and stderr-only access

## 2. Execution And Diagnostic Routing

- [x] 2.1 Update shell diagnostic handling so formatted diagnostics are emitted on stderr instead of stdout
- [x] 2.2 Update execute-path and shell-boundary flows so expansion/runtime diagnostic failures populate stderr and preserve deterministic `exitCode`
- [x] 2.3 Ensure pipeline execution continues to treat stdout records as the only pipelineable output channel

## 3. Shell API And Exit-Code Semantics

- [x] 3.1 Add explicit `ShellCommand` result methods for separate stdout/stderr retrieval and structured command results
- [x] 3.2 Rename programmatic completion-state fields/helpers to `exitCode` where the API exposes command results directly
- [x] 3.3 Update `$status` handling to preserve full command exit codes instead of collapsing values to a boolean success/failure model
- [x] 3.4 Decide and implement transitional behavior for ambiguous compatibility helpers such as `text()` and `lines()`

## 4. Verification

- [x] 4.1 Add shell API tests covering separated stdout/stderr output and structured `exitCode` results
- [x] 4.2 Add or update diagnostic end-to-end tests proving diagnostics appear on stderr and not in stdout pipeline output
- [x] 4.3 Add or update `$status` tests proving non-zero diagnostic exit codes are preserved
- [x] 4.4 Run affected compiler and SHFS test suites and fix regressions from the channel separation

## 5. Bun API Alignment

- [x] 5.1 Replace bespoke shell result helpers with a Bun-like awaitable command that resolves to a `ShellOutput`-style object
- [x] 5.2 Remove public stderr-only/result-wrapper methods that Bun.$ does not provide, while keeping stdout readers Bun-like
- [x] 5.3 Add Bun-like throw behavior for non-zero exit codes with `ShellError` and throw-control helpers
- [x] 5.4 Update shell and harness tests to use Bun-like awaiting/error inspection instead of `result()` or stderr helper methods
- [x] 5.5 Run affected SHFS test suites and verify the Bun-aligned API passes
