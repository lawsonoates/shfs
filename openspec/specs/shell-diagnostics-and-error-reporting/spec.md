## ADDED Requirements

### Requirement: SHFS uses one shared diagnostic model for user-facing failures
SHFS SHALL represent ordinary user-facing failures through one shared diagnostic model across parsing, command compilation, expansion, and runtime execution. The shared diagnostic model SHALL support stable codes, a human-readable message, severity, phase metadata, and available location context such as source span, token text, token index, or command identity.

#### Scenario: Parser syntax failure uses the shared diagnostic model
- **WHEN** a command contains invalid shell syntax
- **THEN** SHFS SHALL produce a diagnostic with phase metadata identifying parse-time failure
- **AND** the diagnostic SHALL include source-span information when parser location data is available

#### Scenario: Command usage failure uses the shared diagnostic model
- **WHEN** a command such as `grep` receives an invalid option or missing option value
- **THEN** SHFS SHALL produce a diagnostic using the same shared model
- **AND** the diagnostic SHALL preserve command-specific context such as the token text and token index when available

### Requirement: Ordinary user mistakes follow the diagnostic pipeline instead of exception-only control flow
SHFS SHALL treat ordinary user mistakes as diagnostics rather than relying solely on thrown exceptions. Invalid syntax, invalid flags, missing values, invalid argument values, and deterministic expansion failures SHALL be representable in the diagnostic pipeline even if legacy code paths still throw internally during migration.

#### Scenario: Syntax exception is converted to a diagnostic
- **WHEN** the parser detects unexpected end-of-input or an unexpected token
- **THEN** SHFS SHALL surface the failure through the shared diagnostic pipeline rather than only as raw exception formatting

#### Scenario: Expansion ambiguity becomes a diagnostic
- **WHEN** a runtime expansion used by command execution or redirection resolves to an invalid or ambiguous result under SHFS rules
- **THEN** SHFS SHALL report that failure as a shared diagnostic with runtime or expansion phase metadata

### Requirement: The shell boundary formats diagnostics consistently for users
The shell entrypoint SHALL be responsible for formatting diagnostics into user-visible error output and mapping them to deterministic exit status behavior. User-facing formatting SHALL be consistent across parser, compiler, expansion, and runtime-originated diagnostics.

#### Scenario: Syntax and usage errors share one output style
- **WHEN** one command fails due to syntax and another fails due to invalid command usage
- **THEN** the shell SHALL render both failures using one consistent diagnostic formatting path
- **AND** each rendered error SHALL preserve its phase-appropriate location context when available

#### Scenario: Diagnostic failure returns deterministic status
- **WHEN** execution completes with one or more error-severity diagnostics
- **THEN** SHFS SHALL return a deterministic non-zero status for that command run

### Requirement: Internal faults remain distinct from ordinary user-facing diagnostics
SHFS SHALL continue to allow exceptions for internal faults, impossible states, and abort conditions where continued evaluation is unsafe. Such faults SHALL remain distinct from ordinary usage diagnostics and SHALL NOT require every internal exception to be presented as a normal user mistake.

#### Scenario: Internal fault is not mislabeled as usage error
- **WHEN** an internal invariant is violated during execution
- **THEN** SHFS SHALL distinguish that fault from ordinary syntax or command-usage diagnostics
