## 1. FS Contract And Rename Rules

- [ ] 1.1 Extend `packages/shfs/src/fs/fs.ts` with a required `rename(src, dest): Promise<void>` method and update any affected type imports or compile-time consumers.
- [ ] 1.2 Lock the subset rename contract in tests and implementation notes: missing sources fail, destination parents must exist, root renames are rejected, and forced file overwrites can rely on rename replacement semantics.

## 2. MemoryFS Rename Implementation

- [ ] 2.1 Implement `MemoryFS.rename(...)` in `packages/shfs/src/fs/memory.ts` so file moves and directory subtree moves update files, directories, and metadata consistently under normalized paths.
- [ ] 2.2 Add regression tests in `packages/shfs/src/fs/memory.test.ts` covering file rename, directory rename, destination-file replacement, and invalid-target failure cases.

## 3. mv Integration And Validation

- [ ] 3.1 Refactor `packages/shfs/src/operator/mv/mv.ts` so resolved source/target pairs call `fs.rename(...)` instead of the current read/write/delete helper, while preserving existing `force`, `interactive`, and multi-source destination checks.
- [ ] 3.2 Update `packages/shfs/src/operator/mv/mv.test.ts` to verify rename-backed moves still cover single-file moves, renames into directories, multi-file moves, and deterministic destination-exists failures.
- [ ] 3.3 Run targeted Bun tests for the `packages/shfs` rename and `mv` paths, then fix any regressions introduced by the new filesystem primitive.
