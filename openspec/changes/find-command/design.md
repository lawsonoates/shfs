## Context

SHFS implements a fish shell subset for agent filesystem sandboxing. Commands follow a two-layer architecture: a compiler handler parses arguments into IR types, and a runtime operator executes them over async record streams. The `find` command needs to fit this existing pattern. An extensive GNU find test suite already exists on the `find` branch covering name/path matching, type filtering, time predicates, traversal control, actions, and error handling.

## Goals / Non-Goals

**Goals:**
- Implement `find` as a transducer that emits `FileRecord` streams, composable with pipes
- Support core GNU find predicates: `-name`, `-path`, `-type`, `-mtime`, `-atime`, `-ctime`, `-newer`
- Support traversal controls: `-maxdepth`, `-mindepth`, `-depth`
- Support actions: `-print`, `-exec`, `-execdir`, `-printf`
- Support special inputs: `-files0-from`
- Support metadata predicates: `-inum`, `-uid`, `-gid`, `-user`, `-group`
- Pass the existing GNU find test suite

**Non-Goals:**
- Symlink handling (excluded from SHFS scope)
- `-prune` action (complex interaction with traversal order)
- `-regex` predicate (GNU extension, not needed for core use)
- `-ok` interactive confirmation action
- `-delete` action (agents should use `rm` explicitly)

## Decisions

### 1. Find is a transducer, not an effect

`find` produces a stream of `FileRecord` entries for matching paths. This makes it composable with downstream commands via piping (e.g., `find /dir -name "*.ts" | grep pattern`). Unlike `rm`/`mv`/`cp` which are effects, `find` is a producer/filter.

**Alternative considered**: Making it an effect that prints directly. Rejected because it would break pipeline composability, which is core to the shell model.

### 2. Predicate composition uses AND logic with short-circuit evaluation

All predicates are combined with implicit AND, matching GNU find behavior. Predicates are evaluated left-to-right and short-circuit on first failure. This is the standard GNU find semantics.

**Alternative considered**: Supporting `-or` and grouping with `\(`. Deferred to a future change — AND-only covers the vast majority of use cases.

### 3. Compiler produces a FindStep IR with structured predicate/action arrays

The `FindStep` IR contains: starting paths, an ordered array of predicates (each with type and parameters), traversal options, and an action. The compiler parses the positional argument grammar of `find` (paths before first predicate, then predicate/action tokens).

**Alternative considered**: Passing raw args to the operator for runtime parsing. Rejected because it violates the compiler/runtime separation — all argument parsing belongs in the compiler layer.

### 4. Reuse picomatch for glob pattern matching in `-name` and `-path`

`picomatch` is already a dependency used by the grep operator. It handles the glob semantics needed for `-name` (basename-only) and `-path` (full path) matching.

### 5. Recursive traversal uses existing FS.readdir() + FS.stat()

No new FS interface methods needed. Recursive descent uses `readdir()` to list children and `stat()` to check types and metadata. Depth tracking is handled internally by the operator.

### 6. `-exec` runs commands via the existing execution engine

`-exec cmd {} \;` and `-exec cmd {} +` substitute paths into command templates. Since SHFS already has a command execution pipeline, `-exec` delegates to it. `-execdir` changes cwd to the file's parent directory before execution.

## Risks / Trade-offs

- **[Performance on deep trees]** → Recursive traversal with stat per entry could be slow on very large trees. Mitigation: `-maxdepth` limits traversal; stat results are not cached (kept simple, optimize later if needed).
- **[FS.stat() limitations]** → Current stat returns `{ isDirectory, size, mtime }` but not atime/ctime/uid/gid/inum. Mitigation: metadata predicates (`-inum`, `-uid`, etc.) will need FS.stat() to be extended, or these predicates return stub/simulated values. The test suite checks for these — design the IR to support them even if initial runtime is limited.
- **[`-exec` security]** → Command injection via path names. Mitigation: paths are substituted as literal arguments, not parsed as shell code.
