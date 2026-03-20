## Why

The `FS` interface is missing a native rename primitive, so `mv` currently emulates moves by reading a file, writing a copy, and deleting the source. That makes moves non-atomic, prevents adapters from exposing a native rename, and keeps `mv` coupled to file-only behavior even when an adapter could move entries more directly.

## What Changes

- Add a required `rename(src, dest)` method to the `FS` contract for adapter implementations.
- Define rename semantics for existing-path checks and destination replacement so adapters expose a consistent contract to higher-level operators.
- Update the in-memory filesystem to implement `rename` for the subset behaviors used by `shfs`.
- Refactor `mv` to delegate the actual move operation to `fs.rename(...)` after preserving its existing destination validation rules.
- Add regression coverage for adapter rename behavior and for `mv` using the shared rename primitive instead of copy-and-delete.

## Capabilities

### New Capabilities
- `filesystem-adapter-contracts`: Define the shared `FS` rename primitive and the adapter-level semantics that `mv` and future filesystem operators rely on.

### Modified Capabilities
- *(none)*

## Impact

- Affected specs: new `openspec/changes/add-fs-rename-primitive/specs/filesystem-adapter-contracts/spec.md`
- Affected code areas (expected): `packages/shfs/src/fs/fs.ts`, `packages/shfs/src/fs/memory.ts`, `packages/shfs/src/operator/mv/mv.ts`, and any tests covering `MemoryFS` or `mv`.
- Affected API: the `FS` TypeScript interface becomes stricter because all implementations must provide `rename(src, dest)`.
- No new external dependencies are expected; this is an internal filesystem contract improvement with downstream behavior benefits for move operations.
