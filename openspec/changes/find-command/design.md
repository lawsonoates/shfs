## Context

SHFS implements a fish-inspired subset for agent filesystem sandboxing. Commands follow a two-layer architecture: a compiler handler parses arguments into IR types, and a runtime operator executes them over async record streams. The `find` command needs to fit this existing pattern while staying inside the SHFS subset boundary. A GNU-derived test corpus already exists on the `find` branch, but only the parts covering in-scope traversal, filtering, and deterministic errors should drive this change.

## Goals / Non-Goals

**Goals:**
- Implement `find` as a transducer that emits `FileRecord` streams, composable with pipes
- Support subset predicates: `-name`, `-path`, `-type`
- Support traversal controls: `-maxdepth`, `-mindepth`, `-depth`
- Support default and explicit `-print`
- Keep error handling deterministic for unsupported predicates, unsupported options, invalid arguments, and missing starting paths
- Pass the narrowed GNU-derived SHFS subset test suite

**Non-Goals:**
- Full GNU/POSIX `find` compatibility
- Symlink handling and symlink-focused predicates or behavior
- Time and metadata predicates such as `-mtime`, `-atime`, `-ctime`, `-newer`, `-inum`, `-uid`, `-gid`, `-user`, and `-group`
- GNU-specific input and formatting features such as `-files0-from` and `-printf`
- Command-execution and interactive actions such as `-exec`, `-execdir`, `-ok`, and `-okdir`
- Advanced expression features such as `-or`, grouping with `(` and `)`, and `,`

## Decisions

### 1. Find is a transducer, not an effect

`find` produces a stream of `FileRecord` entries for matching paths. This makes it composable with downstream commands via piping (e.g., `find /dir -name "*.ts" | grep pattern`). Unlike `rm`/`mv`/`cp` which are effects, `find` is a producer/filter.

**Alternative considered**: Making it an effect that prints directly. Rejected because it would break pipeline composability, which is core to the shell model.

### 2. Predicate composition uses AND logic with short-circuit evaluation

All predicates are combined with implicit AND. Predicates are evaluated left-to-right and short-circuit on first failure.

**Alternative considered**: Supporting `-or` and grouping with `\(`. Rejected for this change because the SHFS boundary explicitly keeps advanced `find` expressions out of scope.

### 3. Compiler produces a FindStep IR with structured predicate and traversal data

The `FindStep` IR contains: starting paths, an ordered array of predicates (each with type and parameters), traversal options, and print behavior. The compiler parses the positional argument grammar of `find` (paths before first predicate, then predicate/action tokens), while only accepting the in-scope subset.

**Alternative considered**: Passing raw args to the operator for runtime parsing. Rejected because it violates the compiler/runtime separation — all argument parsing belongs in the compiler layer.

### 4. Reuse picomatch for glob pattern matching in `-name` and `-path`

`picomatch` is already a dependency used by the grep operator. It handles the glob semantics needed for `-name` (basename-only) and `-path` (full path) matching.

### 5. Recursive traversal uses existing FS.readdir() + FS.stat()

No new FS interface methods are needed. Recursive descent uses `readdir()` to list children and `stat()` to check entry type. Depth tracking is handled internally by the operator.

### 6. Unsupported `find` features fail deterministically

Unsupported predicates and options should produce stable, deterministic SHFS errors instead of attempting partial GNU compatibility. This keeps the subset boundary crisp and prevents accidental expansion into out-of-scope host or compatibility behavior.

## Risks / Trade-offs

- **[Performance on deep trees]** → Recursive traversal with stat per entry could be slow on very large trees. Mitigation: `-maxdepth` limits traversal; stat results are not cached (kept simple, optimize later if needed).
- **[Subset vs. GNU expectations]** → Contributors may assume broader GNU coverage from the command name alone. Mitigation: keep proposal, spec, tasks, boundary docs, and tests aligned on the narrower SHFS contract.
- **[Path matching semantics]** → `-name` and `-path` are easy to conflate. Mitigation: keep dedicated tests showing basename-only matching for `-name` and full-path matching for `-path`.
