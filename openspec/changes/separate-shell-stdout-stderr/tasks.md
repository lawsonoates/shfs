## 1. Output Channel Abstractions

- [ ] 1.1 Define explicit execute/shell result types that separate stdout, stderr, and `exitCode`
- [ ] 1.2 Split stdout record abstractions from stderr/diagnostic output helpers in the SHFS module structure
- [ ] 1.3 Add shell-level collection/formatting helpers for stdout-only and stderr-only access

## 2. Execution And Diagnostic Routing

- [ ] 2.1 Update shell diagnostic handling so formatted diagnostics are emitted on stderr instead of stdout
- [ ] 2.2 Update execute-path and shell-boundary flows so expansion/runtime diagnostic failures populate stderr and preserve deterministic `exitCode`
- [ ] 2.3 Ensure pipeline execution continues to treat stdout records as the only pipelineable output channel

## 3. Shell API And Exit-Code Semantics

- [ ] 3.1 Add explicit `ShellCommand` result methods for separate stdout/stderr retrieval and structured command results
- [ ] 3.2 Rename programmatic completion-state fields/helpers to `exitCode` where the API exposes command results directly
- [ ] 3.3 Update `$status` handling to preserve full command exit codes instead of collapsing values to a boolean success/failure model
- [ ] 3.4 Decide and implement transitional behavior for ambiguous compatibility helpers such as `text()` and `lines()`

## 4. Verification

- [ ] 4.1 Add shell API tests covering separated stdout/stderr output and structured `exitCode` results
- [ ] 4.2 Add or update diagnostic end-to-end tests proving diagnostics appear on stderr and not in stdout pipeline output
- [ ] 4.3 Add or update `$status` tests proving non-zero diagnostic exit codes are preserved
- [ ] 4.4 Run affected compiler and SHFS test suites and fix regressions from the channel separation
