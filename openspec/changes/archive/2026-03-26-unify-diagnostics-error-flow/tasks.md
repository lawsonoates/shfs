## 1. Shared Diagnostic Model

- [x] 1.1 Add a shared diagnostic type that covers parse, compile, expansion, and runtime phases with stable code/message/severity/location fields
- [x] 1.2 Add helpers for constructing and mapping shared diagnostics from existing parser and command error data
- [x] 1.3 Add shell-boundary diagnostic formatting helpers for consistent user-visible output

## 2. Parser Integration

- [x] 2.1 Update parser diagnostic collection to emit or map to the shared diagnostic type
- [x] 2.2 Update `ParseSyntaxError` and related parser exceptions so syntax failures can be surfaced through the shared diagnostic pipeline
- [x] 2.3 Add parser tests covering shared-diagnostic output for unexpected token and unexpected EOF cases

## 3. Command Compiler Integration

- [x] 3.1 Replace or wrap `grep` command diagnostics with the shared diagnostic type
- [x] 3.2 Replace or wrap `find` command diagnostics with the shared diagnostic type
- [x] 3.3 Update shared argument-parsing helpers to map parse/unknown-flag failures into the shared diagnostic pipeline
- [x] 3.4 Add compiler tests covering invalid option, missing value, and invalid numeric-value diagnostics

## 4. Runtime And Shell Reporting

- [x] 4.1 Update execution paths that currently rely on `usageError` booleans to consult shared diagnostics
- [x] 4.2 Convert deterministic expansion/runtime user mistakes into shared diagnostics where practical
- [x] 4.3 Route shell-facing error output through one formatting path and preserve deterministic non-zero status behavior
- [x] 4.4 Keep internal fault handling distinct from ordinary usage diagnostics at the shell boundary

## 5. Verification

- [x] 5.1 Add or update end-to-end tests proving syntax, command-usage, and expansion failures share one output style
- [x] 5.2 Add or update tests proving error-severity diagnostics produce deterministic non-zero status
- [x] 5.3 Run the affected compiler and SHFS test suites and fix regressions introduced by the migration
