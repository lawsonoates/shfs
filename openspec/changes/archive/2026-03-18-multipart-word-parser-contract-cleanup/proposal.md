## Why

The compiler frontend already models words as sequences of literal, glob, and command substitution parts, but the current lexer/parser contract rarely produces real multipart data. That mismatch drops structure for mixed inputs like `foo(bar)baz` and makes future parser and runtime work harder just as globbing and command substitution coverage are expanding.

## What Changes

- Standardize the lexer/parser contract on generic word-like tokens plus structured per-word metadata instead of parser-facing expansion token kinds that the scanner seldom emits.
- Teach the frontend to materialize real multipart `WordPart[]` sequences for mixed literal, glob, and command substitution words, including quoted literal segments.
- Preserve multipart word structure through compiler IR and helper utilities so mixed words are no longer collapsed or partially lost before execution.
- Add focused lexer, parser, compiler, and compatibility tests for mixed word forms, quoting, and nested command substitution boundaries.

## Capabilities

### New Capabilities
- `compiler-word-model`: Define the canonical frontend contract for word tokens and require multipart word structure to survive lexing, parsing, and compilation.

### Modified Capabilities
- *(none)*

## Impact

- Affected code: `packages/compiler/src/lexer`, `packages/compiler/src/parser`, `packages/compiler/src/compile`, and `packages/compiler/src/ir.ts`.
- Expected compatibility touchpoints: command argument stringification helpers and any `packages/shfs/src/execute` word evaluators that currently assume one expansion kind per word.
- Affected tests: compiler lexer/parser/compile suites plus targeted shell execution coverage for mixed word handling.
- No new external dependencies or public API surface expected.
