## Context

`shfs` currently treats move as an operator-level recipe instead of a filesystem primitive. The `FS` interface in `packages/shfs/src/fs/fs.ts` has read, write, delete, list, mkdir, stat, and exists methods, but no way for an adapter to express a native rename. As a result, `packages/shfs/src/operator/mv/mv.ts` reads file bytes, writes a destination copy, and deletes the source, which is less correct than a real move and blocks adapters from preserving metadata or moving directory entries internally.

The change touches multiple layers at once: the shared adapter contract, the in-memory reference adapter, and the `mv` operator that currently reconstructs move behavior outside the interface. That makes a design artifact worthwhile even though the implementation is not large.

## Goals / Non-Goals

**Goals:**
- Add a first-class `rename(src, dest)` primitive to the `FS` contract.
- Define a small, deterministic rename contract that adapter implementations can follow consistently.
- Implement that contract in `MemoryFS`, including subtree updates for directory renames.
- Refactor `mv` so the actual move step uses `fs.rename(...)` instead of copy-and-delete.
- Add regression coverage that protects the adapter contract and verifies `mv` is wired to the new primitive.

**Non-Goals:**
- Expanding user-facing `mv` semantics beyond the current subset in this change.
- Standardizing every filesystem error string across all adapter methods.
- Adding broader filesystem-interface improvements from the note, such as typed directory entries or named stat types.
- Introducing cross-filesystem moves or fallback copy-and-delete behavior inside `rename`.

## Decisions

### 1. Make `rename` a required `FS` method
- Decision: Extend `FS` with `rename(src, dest): Promise<void>` as a required method rather than an optional capability.
- Why: The user asked for improvement #1 specifically, and `mv` should be able to rely on a real primitive instead of branching on adapter support. Making the method required keeps the interface honest and forces every in-repo implementation to expose the same capability.
- Alternative considered: Add `rename?` as an optional method and keep `mv` fallback logic.
- Why not: That would preserve the old copy/delete path and weaken the contract this change is supposed to introduce.

### 2. Define `rename` as an entry-level move primitive
- Decision: The contract will cover both file and directory entries, even though `mv` will continue rejecting directory operands for now.
- Why: A rename primitive is most useful when it maps to what adapters can naturally do: move an entry from one path to another. Restricting the contract to files would bake an unnecessary limitation into the adapter layer and make future directory-move work harder.
- Alternative considered: Specify a file-only rename because current `mv` is file-only.
- Why not: The interface would immediately underspec the adapter behavior the note is trying to unlock.

### 3. Normalize paths and update subtrees inside adapters
- Decision: `rename` should follow the same internal path-normalization expectations as the rest of `MemoryFS`, and directory renames should rewrite descendant file, directory, and metadata keys in one adapter operation.
- Why: `MemoryFS` already normalizes on every method call, and callers rely on that behavior today. Reusing the same convention keeps rename predictable and lets the in-memory adapter preserve a coherent tree after directory moves.
- Alternative considered: Require callers to pass normalized paths for `rename` only.
- Why not: That would create a surprising one-off rule in the shared interface.

### 4. Preserve `mv` validation, but delegate the move itself to `rename`
- Decision: Keep `mv` responsible for CLI-level validation such as multi-source destination checks, destination-exists behavior for `force` and `interactive`, and current directory-operand rejection. Once a source/target pair is resolved, `mv` should call `fs.rename(src, dest)`.
- Why: Those checks are shell-command semantics, not adapter semantics. This keeps the change focused while still eliminating the copy/delete implementation path.
- Alternative considered: Simplify `mv` further by pushing overwrite and directory-policy logic into `rename`.
- Why not: That would blur command policy with adapter behavior and broaden the change unnecessarily.

### 5. Support replacement semantics needed by forced moves
- Decision: The rename contract should allow replacing an existing destination file, while still rejecting invalid cases such as renaming the root path or replacing a non-empty directory.
- Why: `mv -f` already allows overwriting a file target, and this change should let the operator preserve that behavior while using a single rename call. Restricting rename to “destination must not exist” would force `mv` back into extra delete steps.
- Alternative considered: Require callers to delete the destination before renaming.
- Why not: That would reintroduce the multi-step behavior this change is meant to remove.

### 6. Cover adapter behavior directly in tests
- Decision: Add tests at the `MemoryFS` level for file rename, directory rename, and overwrite/error cases, then keep `mv` tests focused on command semantics.
- Why: The risky part of this change is the shared adapter contract. If only `mv` tests exist, a future adapter regression could slip through while command-level behavior still appears to work.
- Alternative considered: Verify the change only through existing `mv` tests.
- Why not: That would not protect the new interface surface area well enough.

## Risks / Trade-offs

- [Risk] A required `rename` method is a breaking TypeScript interface change for any adapter implementation outside the touched files. -> Mitigation: keep the contract small, update all in-repo implementations immediately, and call out the API impact clearly in the proposal.
- [Risk] Directory rename logic in `MemoryFS` could leave stale metadata or broken child paths if the subtree rewrite is incomplete. -> Mitigation: structure implementation around collecting and rewriting all affected file, directory, and metadata entries together, then add directory-focused tests.
- [Risk] The contract could imply broader `mv` behavior than the command actually exposes today. -> Mitigation: document in design and tasks that `mv` still rejects directory operands in this change even though adapters support entry-level rename.
- [Risk] Replacement semantics can get tricky around directory destinations. -> Mitigation: scope the supported overwrite path to existing file targets needed by current `mv -f` behavior, and fail deterministic invalid cases instead of trying to mirror full POSIX rename semantics.

## Migration Plan

1. Add the new `filesystem-adapter-contracts` spec describing rename requirements.
2. Extend `packages/shfs/src/fs/fs.ts` with `rename(src, dest)`.
3. Implement `rename` in `packages/shfs/src/fs/memory.ts`, including subtree rewrites and overwrite/error handling for the subset contract.
4. Replace `mv`'s `moveFile()` copy/delete logic with a direct `fs.rename(...)` call after existing validation.
5. Add or update tests in `packages/shfs/src/fs/memory.test.ts` and `packages/shfs/src/operator/mv/mv.test.ts`.
6. Run targeted Bun tests for `packages/shfs` and fix any regressions.

Rollback strategy:
- Revert the `FS` interface addition, remove `MemoryFS.rename`, restore `mv`'s copy/delete helper, and revert the associated spec/task/test updates together.

## Open Questions

- None at this time.
