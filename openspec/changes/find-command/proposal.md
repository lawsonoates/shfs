## Why

SHFS provides agents with a filesystem sandbox supporting common shell commands, but currently lacks `find` for recursive file discovery. Without `find`, agents cannot efficiently locate files across directory trees, which is a fundamental filesystem operation. The SHFS boundary now includes a narrow, deterministic `find` subset centered on recursive traversal, name/path filtering, type filtering, depth controls, default printing, and pipeline composability. The existing GNU-derived test corpus gives us a strong upstream reference, but this change should adapt that corpus to the in-scope SHFS subset rather than target full GNU compatibility.

## What Changes

- Add `find` command compiler handler to parse subset predicates and traversal controls into `FindStep` IR
- Add `FindStep` IR types to the compiler's IR union
- Add `find` operator as a transducer that recursively traverses directories and emits `FileRecord` streams
- Register `find` in the command handler registry and execution dispatcher
- Support subset predicates: `-name`, `-path`, `-type` with `f` and `d`
- Support traversal controls: `-maxdepth`, `-mindepth`, `-depth`
- Support `-print` as the default and explicit action
- Reject unsupported predicates and options with deterministic errors
- Narrow the GNU-derived spec suite to tests that remain within the SHFS boundary

## Capabilities

### New Capabilities
- `find-command`: Recursive file discovery with deterministic SHFS subset semantics for traversal, filtering, and stream output

### Modified Capabilities


## Impact

- **Compiler**: New `find/` handler directory under `packages/compiler/src/compile/command/`, new IR types in `ir.ts`, handler registration in `handler.ts`
- **Runtime**: New `find/` operator directory under `packages/shfs/src/operator/`, execution dispatch in `execute.ts`
- **FS interface**: No changes needed for the subset — `readdir()`, `stat()`, and `exists()` already provide what recursive traversal, type filtering, and path matching require
- **Dependencies**: May reuse `picomatch` (already used by grep) for glob pattern matching
