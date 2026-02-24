## 1. Lexer and Parser Script Structure

- [x] 1.1 Add tokenization support for semicolon statement separators in the compiler lexer/operator definitions.
- [x] 1.2 Extend parser AST types so a program can represent an ordered list of statements instead of a single pipeline.
- [x] 1.3 Update statement parsing to consume newline and semicolon separators while preserving existing pipe continuation behavior.
- [x] 1.4 Add parser tests for newline-separated statements, semicolon-separated statements, mixed separators, and trailing separator handling.

## 2. Compiler IR and Translation

- [x] 2.1 Introduce script-level IR types that preserve statement order and include statement-level chaining metadata fields.
- [x] 2.2 Refactor compile entrypoints to translate script AST into script IR while keeping existing pipeline step compilation intact.
- [x] 2.3 Add compiler tests verifying statement ordering and default unconditional chaining metadata in generated IR.

## 3. Runtime Execution Sequencing

- [x] 3.1 Add executor support for script IR that evaluates statements sequentially within one run context.
- [x] 3.2 Ensure per-run shared context is reused across all statements so state changes from earlier statements are visible later in the same run.
- [x] 3.3 Keep current single-pipeline execution behavior compatible by routing it through the new script execution path.
- [x] 3.4 Add executor tests for deterministic statement execution order and context propagation across statements.

## 4. Shell Integration and Validation

- [x] 4.1 Update shell compile/execute wiring to use the new script-level parser and IR flow.
- [x] 4.2 Add shell/spec tests that cover newline-separated and semicolon-separated script execution in one invocation.
- [x] 4.3 Run targeted subset tests for statement chaining expectations and fix regressions introduced by script-level changes.
