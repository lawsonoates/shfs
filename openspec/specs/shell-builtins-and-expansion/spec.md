# shell-builtins-and-expansion Specification

## Purpose
TBD - created by archiving change complete-cd-subset-steps-2-8. Update Purpose after archive.
## Requirements
### Requirement: Standalone command substitution arguments
The parser and compiler SHALL support command substitution expressions in argument position, including when the argument starts with `(` and when substitutions are nested.

#### Scenario: Substitution used as cd argument
- **WHEN** a statement contains `cd (echo subdir)`
- **THEN** the substitution is parsed as a command argument expression and can be compiled/executed without syntax errors

#### Scenario: Nested substitutions resolve inner-first
- **WHEN** a statement contains nested substitutions such as `echo (echo (echo nested))`
- **THEN** execution resolves inner substitutions before outer substitutions and passes the final text to the outer command

### Requirement: Variable expansion and scoped variable storage
The runtime SHALL support variable expansion in command arguments and maintain both global and run-local variable scopes.

#### Scenario: Global variable persists across runs
- **WHEN** `set -g PROJECT_ROOT /workspace` is executed in one run and `$PROJECT_ROOT` is read in a later run
- **THEN** the variable expands to `/workspace`

#### Scenario: Local variable is scoped to one run
- **WHEN** `set -l LOCAL_ONLY scoped` is executed and `$LOCAL_ONLY` is read in the same run and then in a later run
- **THEN** it expands to `scoped` in the same run and to empty text in the later run

### Requirement: Builtin command support for subset workflow
The compiler and runtime SHALL support builtin commands `echo`, `set`, `test`, `read`, and `string` with subset semantics needed by the cd/glob subset tests.

#### Scenario: Echo emits literal and expanded arguments
- **WHEN** `echo` is executed with plain arguments or expanded variables
- **THEN** it emits one line of text containing the evaluated arguments in order

#### Scenario: Read captures pipeline input into a variable
- **WHEN** `echo /workspace | read target` is executed
- **THEN** the variable `target` is assigned from pipeline input and is available to subsequent statements in the same run

#### Scenario: String helpers can produce cd targets
- **WHEN** `string replace` output is used in command substitution for a path argument
- **THEN** the resulting transformed text can be consumed as the command argument

### Requirement: Status tracking and status variable expansion
The runtime SHALL store command success/failure status as `0` or `1` and expose it via `$status` expansion.

#### Scenario: Success status expands to zero
- **WHEN** a successful command completes
- **THEN** `$status` expands to `0`

#### Scenario: Failure status expands to one
- **WHEN** a failing command completes
- **THEN** `$status` expands to `1`

