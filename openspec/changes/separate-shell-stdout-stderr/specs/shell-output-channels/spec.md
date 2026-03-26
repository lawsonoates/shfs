## ADDED Requirements

### Requirement: Shell command results expose explicit output channels
The programmatic shell API SHALL expose command results with separate `stdout`, `stderr`, and `exitCode` fields.
Stdout SHALL contain pipelineable command output records only, and stderr SHALL contain user-facing error output lines.

#### Scenario: Successful command returns stdout without stderr
- **WHEN** a caller runs a command that succeeds without diagnostics
- **THEN** the shell API returns stdout records for the command output
- **AND** stderr is empty
- **AND** `exitCode` is `0`

#### Scenario: Diagnostic command returns stderr without polluting stdout
- **WHEN** a caller runs a command that fails with a formatted diagnostic
- **THEN** the shell API returns the diagnostic text in stderr
- **AND** stdout does not contain that diagnostic as ordinary pipeline output
- **AND** `exitCode` is the command's deterministic non-zero exit code

### Requirement: Shell convenience helpers make channel intent explicit
The shell API SHALL provide convenience helpers whose names make stdout vs stderr access explicit, and SHALL expose the command's completion state as `exitCode` in programmatic result objects.

#### Scenario: Caller retrieves stdout and stderr separately
- **WHEN** a caller requests stdout text and stderr text for one command invocation
- **THEN** the API provides separate stdout-only and stderr-only access paths
- **AND** retrieving one channel does not implicitly merge in the other

#### Scenario: Caller inspects exit code directly
- **WHEN** a caller requests structured command output
- **THEN** the result includes an `exitCode` field
- **AND** the caller does not need to infer completion state from combined output text
