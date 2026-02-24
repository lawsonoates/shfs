## Why

The current shell parser accepts only a single pipeline per run, which blocks core script semantics needed by the failing subset tests. Adding first-class multi-statement script parsing and execution now unlocks subsequent work on status-based chaining and builtins.

## What Changes

- Add script-level parsing for multiple statements separated by newline and `;`.
- Compile scripts into an IR shape that preserves statement boundaries and execution order.
- Include statement-level chaining metadata needed for later `and`/`or` flow control work.
- Execute statements sequentially within one shell invocation while preserving shared run context.
- Keep this change scoped to statement structure and ordering; command semantics are handled in follow-up changes.

## Capabilities

### New Capabilities

- `script-statement-execution`: Parse, compile, and execute multi-statement scripts with newline and semicolon separators in a single shell run.

### Modified Capabilities

- None.

## Impact

- Affected compiler layers: lexer tokens/operators, parser AST for program/script structure, and compile output shape.
- Affected runtime layers: script execution orchestration and per-run statement sequencing.
- Affected tests: shell/spec coverage for newline- and semicolon-separated scripts.
- No external API or dependency changes.
