## Why

SHFS provides agents with a filesystem sandbox supporting common shell commands, but currently lacks `find` — the standard tool for recursive file discovery by name, type, time, and other predicates. Without `find`, agents cannot efficiently locate files across directory trees, which is a fundamental filesystem operation. An extensive GNU find test suite (1393 lines across 9 test files) is already written on the `find` branch and ready to validate the implementation.

## What Changes

- Add `find` command compiler handler to parse predicates and actions into `FindStep` IR
- Add `FindStep` IR types to the compiler's IR union
- Add `find` operator as a transducer that recursively traverses directories and emits `FileRecord` streams
- Register `find` in the command handler registry and execution dispatcher
- Support core GNU find predicates: `-name`, `-path`, `-type`, `-mtime`, `-atime`, `-ctime`, `-newer`
- Support traversal controls: `-maxdepth`, `-mindepth`, `-depth`
- Support actions: `-print` (default), `-exec`, `-execdir`, `-printf`
- Support special input: `-files0-from`
- Support metadata predicates: `-inum`, `-uid`, `-gid`, `-user`, `-group`

## Capabilities

### New Capabilities
- `find-command`: Recursive file discovery with predicate-based filtering, traversal control, and output actions following GNU find semantics

### Modified Capabilities


## Impact

- **Compiler**: New `find/` handler directory under `packages/compiler/src/compile/command/`, new IR types in `ir.ts`, handler registration in `handler.ts`
- **Runtime**: New `find/` operator directory under `packages/shfs/src/operator/`, execution dispatch in `execute.ts`
- **FS interface**: No changes needed — `readdir()`, `stat()`, and `exists()` already provide everything required for recursive traversal
- **Dependencies**: May reuse `picomatch` (already used by grep) for glob pattern matching
