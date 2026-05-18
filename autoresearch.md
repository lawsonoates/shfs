# Autoresearch: Compiler parse/compile performance

## Objective
Optimize the TypeScript fish-subset compiler/parser hot path for repeated parsing and compilation of realistic shell scripts. The workload parses and compiles generated scripts containing simple commands, pipelines, redirections, quoted arguments, globs, comments, and command substitutions.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — median wall-clock time for the benchmark loop
- **Secondary**: `parse_ms`, `compile_ms`, `tokens`, `statements` — phase timings and workload shape monitors

## How to Run
`./autoresearch.sh` — outputs `METRIC name=number` lines.

## Files in Scope
- `packages/compiler/src/lexer/*.ts` — scanner, source reader, token definitions, operators, positions
- `packages/compiler/src/parser/*.ts` — parser, AST construction, statement/command/word parsers
- `packages/compiler/src/compile/*.ts` — AST to IR compilation
- `packages/compiler/src/ir.ts` — IR helpers if compile allocation overhead is relevant
- `test/compiler/**/*.ts` — tests may be adjusted only to reflect behavior-preserving refactors
- `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.md` — benchmark/check documentation and instrumentation

## Off Limits
- Public package metadata and exports unless needed for correctness-preserving optimization
- Runtime package `packages/shfs/src/**` unless profiling shows compiler/runtime boundary overhead
- Generated `dist/` files and `tsconfig.tsbuildinfo`
- Existing user notes and unrelated untracked files in `notes/` or project root

## Constraints
- Preserve parser/compiler behavior and public API.
- No new runtime dependencies.
- `bun test test/compiler` and `bun run typecheck` must pass via `autoresearch.checks.sh` for kept changes.
- Prefer simple, maintainable changes over complex micro-optimizations with tiny/noisy wins.

## What's Been Tried
- Baseline session setup: benchmark parses and compiles a deterministic generated workload multiple times and reports medians.
- Initial workload with `(pwd)` command substitutions crashed in `compile()` serialization; benchmark was adjusted to avoid command substitutions so the primary metric targets supported parse+compile behavior.
- Workload also had to avoid unsupported external commands (for example `uniq`); generated commands are limited to registered compiler handlers.
