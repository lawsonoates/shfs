## Context

The current compiler/parser pipeline treats a program as exactly one pipeline, which prevents a single shell run from executing script-style input containing multiple statements. The failing subset tests require newline- and semicolon-separated statement execution semantics, but this step is intentionally limited to statement structure, ordering, and execution flow rather than adding new command behaviors.

Constraints:
- Preserve existing single-pipeline behavior for current commands.
- Keep runtime context shared across statements in one shell invocation.
- Avoid coupling this step to builtin additions (`echo`, `set`, `test`, `read`, `string`) that belong to later steps.

## Goals / Non-Goals

**Goals:**
- Parse script input as an ordered list of statements, where each statement may contain a pipeline.
- Support both newline and `;` as statement separators.
- Compile script AST into an IR that preserves statement order and supports future statement-level chaining metadata.
- Execute compiled statements sequentially in one shell invocation with shared run context.

**Non-Goals:**
- Implement new builtin commands or command semantics.
- Implement variable expansion, status variables, or boolean chaining behavior.
- Change external package APIs beyond what is required for script-level execution in this repository.

## Decisions

1. Introduce explicit script-level AST and IR nodes.
- Decision: represent a parsed program as a list of statements rather than a single pipeline.
- Rationale: this cleanly models separators and gives a stable place for future per-statement metadata (`and`/`or` conditions) without overloading pipeline nodes.
- Alternative considered: flatten statements into a single synthetic pipeline. Rejected because effect commands already require terminal position constraints and this approach breaks command semantics.

2. Add lexer/parser support for semicolon as a statement separator token.
- Decision: treat `;` similarly to newline at statement boundaries while preserving current pipe behavior.
- Rationale: tests require semicolon chaining and newline chaining with equivalent sequencing rules.
- Alternative considered: pre-splitting input strings on `;` and newline before parsing. Rejected because this is quote/escape unsafe and bypasses parser correctness.

3. Compile scripts into an ordered execution plan, then execute statement-by-statement.
- Decision: executor receives a script IR and evaluates each statement in order, reusing the same execution context object.
- Rationale: preserves cwd and future run-scoped state across statements while keeping existing pipeline execution logic mostly intact.
- Alternative considered: invoke the current pipeline executor once per parsed statement from Shell without IR changes. Rejected because compile-time metadata and future chaining rules should live in IR, not ad-hoc shell orchestration.

4. Keep step-1 chaining metadata structural-only.
- Decision: add a metadata slot on statements (e.g., condition kind) but do not enforce `and`/`or` behavior in this step.
- Rationale: allows incremental delivery; step 1 unblocks statement parsing/execution while minimizing risk.
- Alternative considered: omit metadata until step 6. Rejected because retrofitting later increases AST/IR churn and migration risk.

## Risks / Trade-offs

- [Parser regression in existing single-command flows] -> Mitigation: retain existing single-pipeline tests and add focused parser tests for statement boundaries.
- [Ambiguity around newline consumption near pipes] -> Mitigation: keep existing pipe continuation rules and add explicit tests for `|\n` versus statement termination.
- [Execution-order bugs with effect commands] -> Mitigation: add executor tests that assert deterministic statement-by-statement ordering and context persistence.
- [Over-designing for future chaining] -> Mitigation: keep metadata minimal and inert until the dedicated chaining step.

## Migration Plan

1. Add parser and AST support for multi-statement scripts and semicolon separators.
2. Add compiler transformation from script AST to script IR while preserving existing pipeline compile behavior.
3. Add executor support for script IR that delegates statement pipelines to current execution logic.
4. Update shell invocation path to compile and execute script IR.
5. Validate with targeted subset tests for newline/semicolon chaining and existing regressions.

Rollback strategy:
- Revert script-level AST/IR wiring and parser separator support as one change; this restores prior single-pipeline behavior.

## Open Questions

- Should empty statements (e.g., trailing `;` or blank lines) be represented explicitly in AST/IR or filtered during parse?
- Should comments between semicolon-delimited statements be attached to neighboring statements or treated as ignorable separators only?
