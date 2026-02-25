## 1. Parser and Expansion Foundations

- [x] 1.1 Update lexer/parser word handling so standalone `(...)` command substitutions parse as argument expressions.
- [x] 1.2 Add nested command substitution parsing/serialization coverage for argument position.
- [x] 1.3 Add variable token parsing and expansion plumbing for `$name` and `$status` in command arguments.
- [x] 1.4 Add parser/compiler tests covering substitution-in-argument and variable expansion forms used by subset specs.

## 2. Builtin Command Compilation and Execution

- [x] 2.1 Add compiler command handlers and IR support for `echo`, `set`, `test`, `read`, and `string`.
- [x] 2.2 Implement executor handling for each new builtin with subset behavior required by `cd.subset` tests.
- [x] 2.3 Add targeted unit tests for builtin compile mapping and execution behavior.

## 3. Runtime State and Statement Chaining

- [x] 3.1 Extend execution context to track command status plus global and run-local variable scopes.
- [x] 3.2 Implement `set -g` persistence across runs and `set -l` scoping within a single run.
- [x] 3.3 Activate `and`/`or` statement chain mode execution using prior statement status.
- [x] 3.4 Add tests verifying `$status` values, chain-mode gating, and variable lifetime rules.

## 4. CD and Glob Contract Enforcement

- [x] 4.1 Add wildcard validation for subset path-taking commands and reject unquoted wildcard patterns with deterministic unsupported-glob errors.
- [x] 4.2 Ensure quoted wildcard characters remain literal and do not trigger wildcard validation failures.
- [x] 4.3 Align `cd` missing-directory error to `cd: directory does not exist: <path>`.
- [x] 4.4 Treat `cd \"\"` as `cd: empty path` failure and update status to `1`.

## 5. End-to-End Validation

- [x] 5.1 Run `bun test packages/shfs/src/spec/glob.subset.test.ts packages/shfs/src/spec/cd.subset.test.ts` and address remaining failures.
- [x] 5.2 Run supporting compiler/executor unit tests to confirm no regressions in script execution behavior.
- [x] 5.3 Update any outdated fixtures or test expectations that conflict with the finalized subset contracts.
