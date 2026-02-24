## MODIFIED Requirements

### Requirement: Statement chaining metadata representation
The script AST and IR MUST provide statement-level chain metadata and the runtime MUST execute statements according to that metadata using prior statement status.

#### Scenario: Default chain mode executes unconditionally
- **WHEN** a statement is compiled without explicit conditional chaining syntax
- **THEN** the statement metadata is represented with `always` mode and the statement executes regardless of prior status

#### Scenario: And chain mode requires prior success
- **WHEN** a statement with `and` chain mode follows a statement that failed
- **THEN** the `and` statement is skipped and does not execute

#### Scenario: Or chain mode requires prior failure
- **WHEN** a statement with `or` chain mode follows a statement that succeeded
- **THEN** the `or` statement is skipped and does not execute
