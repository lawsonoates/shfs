## ADDED Requirements

### Requirement: Shell command results expose explicit output channels
The programmatic shell API SHALL expose command results with separate `stdout`, `stderr`, and `exitCode` fields through a Bun-like awaitable command object.
Stdout SHALL contain pipelineable command output records only internally, and the public awaited output SHALL expose stdout/stderr using Bun-like output objects rather than a bespoke result-wrapper method.

#### Scenario: Successful command await returns stdout without stderr
- **WHEN** a caller runs a command that succeeds without diagnostics
- **THEN** awaiting the command returns an output object with separate `stdout`, `stderr`, and `exitCode`
- **AND** stderr is empty
- **AND** `exitCode` is `0`

#### Scenario: Diagnostic command throws with stderr without polluting stdout
- **WHEN** a caller runs a command that fails with a formatted diagnostic
- **THEN** awaiting the command throws a `ShellError`-like error that exposes the diagnostic text in stderr
- **AND** stdout does not contain that diagnostic as ordinary pipeline output
- **AND** `exitCode` is the command's deterministic non-zero exit code

### Requirement: Shell syntax remains close to Bun.$
The shell API SHALL avoid public helper methods that Bun.$ does not provide when an equivalent Bun-style syntax exists.

#### Scenario: Caller inspects completion state directly from awaited output
- **WHEN** a caller awaits a successful command
- **THEN** the resolved output includes an `exitCode` field
- **AND** the caller does not need a separate `result()` method to inspect it

#### Scenario: Caller reads stdout via Bun-style helpers
- **WHEN** a caller requests `text()`, `json()`, or `lines()`
- **THEN** those helpers read stdout only
- **AND** stderr is accessed through the awaited output object or thrown error, not through bespoke public methods like `stderrLines()`

#### Scenario: Caller suppresses throwing for non-zero exits
- **WHEN** a caller opts into non-throwing execution
- **THEN** a non-zero command resolves with an output object instead of throwing
- **AND** the output still exposes `stdout`, `stderr`, and `exitCode`
