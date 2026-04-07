## Why

SHFS currently reports user-facing errors through a mix of parser exceptions, parser-side diagnostic collection, command-specific diagnostic payloads, and runtime-specific failure paths. That split makes shell behavior uneven for users and makes it harder to add recovery, editor integration, and consistent stderr/status handling as the shell grows.

## What Changes

- Add one shared diagnostic model that can represent parse, compile-time command usage, expansion, and runtime execution errors
- Standardize shell-facing error formatting so syntax errors, invalid options, invalid values, and expansion failures are reported in a consistent style
- Update parser error handling to emit the shared diagnostic shape instead of relying on ad hoc exception formatting alone
- Align command compilers such as `grep` and `find` on the shared diagnostic shape instead of command-local variants
- Add one shell-boundary reporting path that turns diagnostics into user-visible stderr output and deterministic exit status behavior
- Preserve exceptions only for internal bugs or truly exceptional abort conditions, not ordinary user input mistakes

## Capabilities

### New Capabilities
- `shell-diagnostics-and-error-reporting`: Consistent user-facing diagnostics across parsing, compilation, expansion, and execution

### Modified Capabilities

## Impact

- **Compiler**: Parser diagnostics in `packages/compiler/src/parser/`, command diagnostic IR in `packages/compiler/src/compile/command/`, and shared types in `packages/compiler/src/ir.ts` or adjacent diagnostic modules
- **Runtime**: Shell/error formatting and command execution flow in `packages/shfs/src/execute/` and command operators that currently use command-local usage-error handling
- **Behavior**: Users will see more uniform error messages and exit-status semantics across syntax errors, invalid options, invalid values, and expansion failures
- **Testing**: Parser, compiler, and runtime tests will need coverage for diagnostic shape, formatting, and status propagation
