## MODIFIED Requirements

### Requirement: The shell boundary formats diagnostics consistently for users
The shell entrypoint SHALL be responsible for formatting diagnostics into user-visible stderr output and mapping them to deterministic exit-code behavior. User-facing formatting SHALL be consistent across parser, compiler, expansion, and runtime-originated diagnostics.

#### Scenario: Syntax and usage errors share one stderr output style
- **WHEN** one command fails due to syntax and another fails due to invalid command usage
- **THEN** the shell SHALL render both failures using one consistent diagnostic formatting path on stderr
- **AND** each rendered error SHALL preserve its phase-appropriate location context when available

#### Scenario: Diagnostic failure returns deterministic exit code
- **WHEN** execution completes with one or more error-severity diagnostics
- **THEN** the shell SHALL return a deterministic non-zero exit code for that command run
- **AND** the formatted diagnostics SHALL not be surfaced as ordinary stdout pipeline output
