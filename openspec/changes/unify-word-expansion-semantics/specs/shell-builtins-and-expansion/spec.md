## MODIFIED Requirements

### Requirement: Variable expansion and scoped variable storage
The runtime SHALL support variable expansion in command arguments and redirection targets, and maintain both global and run-local variable scopes.

#### Scenario: Global variable persists across runs
- **WHEN** `set -g PROJECT_ROOT /workspace` is executed in one run and `$PROJECT_ROOT` is read in a later run
- **THEN** the variable expands to `/workspace`

#### Scenario: Local variable is scoped to one run
- **WHEN** `set -l LOCAL_ONLY scoped` is executed and `$LOCAL_ONLY` is read in the same run and then in a later run
- **THEN** it expands to `scoped` in the same run and to empty text in the later run

#### Scenario: Variable-expanded output redirection resolves the target path
- **WHEN** `set -g LOGFILE logs.txt` has been executed and `echo hello > $LOGFILE` runs in a later command
- **THEN** the output redirection target resolves to `logs.txt` using the same runtime expansion rules as command arguments

#### Scenario: Variable-expanded input redirection resolves the target path
- **WHEN** `set -g INPUTFILE input.txt` has been executed and `head -n 1 < $INPUTFILE` runs
- **THEN** the input redirection target resolves to `input.txt` using the same runtime expansion rules as command arguments

## ADDED Requirements

### Requirement: Redirection targets use shared runtime word evaluation
The runtime SHALL evaluate redirection targets through the same word-expansion semantics used for command arguments and other runtime consumers.
Redirection targets SHALL resolve to exactly one concrete path before file IO proceeds.

#### Scenario: Command substitution can produce an output redirection target
- **WHEN** a command such as `echo hello > (string join '' out .txt)` is executed
- **THEN** the command substitution is evaluated before redirection file IO
- **AND** the resulting text is used as the output redirection target

#### Scenario: Ambiguous redirection target fails before file IO
- **WHEN** a redirection target expands to more than one concrete path
- **THEN** execution fails with a deterministic single-target expansion error before reading from or writing to the filesystem

#### Scenario: Unmatched wildcard redirection target reports deterministic failure
- **WHEN** a redirection target contains an unquoted wildcard pattern and the shared evaluator finds no matches
- **THEN** execution fails with the same deterministic no-match expansion behavior used by other path-evaluation contexts
