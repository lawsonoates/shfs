## MODIFIED Requirements

### Requirement: Status tracking and status variable expansion
The runtime SHALL store command exit codes and expose the last command's exit code via `$status` expansion.

#### Scenario: Success status expands to zero
- **WHEN** a successful command completes
- **THEN** `$status` expands to `0`

#### Scenario: Diagnostic error exit code is preserved
- **WHEN** a command completes with a deterministic non-zero diagnostic exit code
- **THEN** `$status` expands to that exit code value
- **AND** the runtime does not collapse the value to `1` unless the command's exit code is `1`
