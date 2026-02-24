# script-statement-execution Specification

## Purpose
TBD - created by archiving change support-multi-statement-scripts. Update Purpose after archive.
## Requirements
### Requirement: Multi-statement script parsing
The compiler frontend MUST parse a script run as an ordered sequence of statements, where each statement contains a pipeline. Statement separators SHALL include newline and semicolon (`;`).

#### Scenario: Newline separates statements
- **WHEN** input contains two commands separated by a newline
- **THEN** the parser produces two ordered statements in one script program

#### Scenario: Semicolon separates statements
- **WHEN** input contains two commands separated by `;`
- **THEN** the parser produces two ordered statements in one script program

### Requirement: Statement order preservation
The compiler MUST preserve source-order statement execution intent when producing IR from parsed scripts.

#### Scenario: Ordered compilation
- **WHEN** a script contains three statements in source order
- **THEN** the compiled IR contains exactly three statements in the same order

### Requirement: Sequential statement execution in one run
The shell runtime MUST execute script statements sequentially within a single invocation using a shared run context.

#### Scenario: Newline-separated execution updates shared context
- **WHEN** a script run contains newline-separated statements where an earlier statement updates runtime context
- **THEN** a later statement in the same run observes the updated context

#### Scenario: Semicolon-separated execution updates shared context
- **WHEN** a script run contains semicolon-separated statements where an earlier statement updates runtime context
- **THEN** a later statement in the same run observes the updated context

### Requirement: Statement chaining metadata representation
The script AST and IR MUST provide a statement-level metadata field that can represent future conditional chaining semantics without changing statement ordering behavior in this change.

#### Scenario: Metadata present without behavioral change
- **WHEN** a script statement is compiled without conditional chaining syntax
- **THEN** the statement metadata is represented with the default unconditional mode

