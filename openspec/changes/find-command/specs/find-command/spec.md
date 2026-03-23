## ADDED Requirements

### Requirement: Find searches starting paths recursively
The `find` command SHALL accept one or more starting paths and recursively traverse all directories, emitting a `FileRecord` for each entry that matches all specified predicates. If no starting path is given, it SHALL default to the current working directory.

#### Scenario: Single starting path
- **WHEN** `find /home` is executed
- **THEN** the command SHALL emit a `FileRecord` for every file and directory under `/home` (including `/home` itself)

#### Scenario: Multiple starting paths
- **WHEN** `find /home /tmp` is executed
- **THEN** the command SHALL traverse both `/home` and `/tmp` and emit records for all entries

#### Scenario: No starting path defaults to cwd
- **WHEN** `find -name "*.ts"` is executed without an explicit path
- **THEN** the command SHALL use the current working directory as the starting path

### Requirement: Name predicate matches basename with glob
The `-name <pattern>` predicate SHALL match against the basename of each path using glob semantics (via picomatch). The match SHALL be case-sensitive.

#### Scenario: Glob pattern matches files
- **WHEN** `find /src -name "*.ts"` is executed
- **THEN** only entries whose basename matches `*.ts` SHALL be emitted

#### Scenario: Pattern with slash does not match
- **WHEN** `-name` is given a pattern containing `/`
- **THEN** the command SHALL treat the pattern as a basename test and emit no matches for paths that only match as full paths

### Requirement: Path predicate matches full path with glob
The `-path <pattern>` predicate SHALL match against the full path of each entry using glob semantics.

#### Scenario: Full path glob match
- **WHEN** `find / -path "*/src/*.ts"` is executed
- **THEN** only entries whose full path matches the pattern SHALL be emitted

### Requirement: Type predicate filters by entry type
The `-type <typechars>` predicate SHALL filter entries by type. Supported type characters are `f` (regular file) and `d` (directory). Comma-separated lists using only supported type characters SHALL be accepted. Unsupported type characters SHALL produce an error.

#### Scenario: Filter files only
- **WHEN** `find /src -type f` is executed
- **THEN** only regular files SHALL be emitted (no directories)

#### Scenario: Filter directories only
- **WHEN** `find /src -type d` is executed
- **THEN** only directories SHALL be emitted

#### Scenario: Filter files and directories
- **WHEN** `find /src -type f,d` is executed
- **THEN** regular files and directories SHALL be emitted

#### Scenario: Invalid type character
- **WHEN** `find /src -type z` is executed
- **THEN** the command SHALL report an error about the unknown type argument

### Requirement: Depth controls limit traversal
`-maxdepth <n>` SHALL limit descent to at most n levels below the starting path. `-mindepth <n>` SHALL suppress results for entries less than n levels below the starting path. `-depth` SHALL cause find to process directory contents before the directory itself (post-order traversal).

#### Scenario: Maxdepth limits traversal
- **WHEN** `find / -maxdepth 1` is executed
- **THEN** only the starting path and its direct children SHALL be emitted

#### Scenario: Mindepth suppresses shallow results
- **WHEN** `find / -mindepth 2` is executed
- **THEN** the starting path and its direct children SHALL NOT be emitted, only deeper entries

#### Scenario: Depth flag enables post-order traversal
- **WHEN** `find / -depth` is executed
- **THEN** directory contents SHALL be emitted before the directory itself

### Requirement: Print action is the default
If no action is specified, `find` SHALL use `-print` as the default action, emitting each matching path as a `FileRecord`. The explicit `-print` action SHALL behave the same way.

#### Scenario: Implicit print
- **WHEN** `find /src -name "*.ts"` is executed with no explicit action
- **THEN** matching paths SHALL be emitted as `FileRecord` entries

#### Scenario: Explicit print
- **WHEN** `find /src -type f -print` is executed
- **THEN** matching paths SHALL be emitted as `FileRecord` entries

### Requirement: Find compiler produces FindStep IR
The compiler SHALL parse `find` arguments into a `FindStep` IR containing starting paths as `ExpandedWord[]`, an ordered array of in-scope predicates, traversal options, and print behavior. The `FindStep` SHALL be part of the `StepIR` union.

#### Scenario: Compiler output for simple find
- **WHEN** `find /src -name "*.ts" -type f` is compiled
- **THEN** the resulting IR SHALL contain starting path `/src`, a name predicate with pattern `*.ts`, and a type predicate with value `f`

### Requirement: Find operator emits FileRecord stream
The find runtime operator SHALL be a transducer that accepts the `FindStep` IR and yields `FileRecord` entries for each matching path. It SHALL be composable in pipelines.

#### Scenario: Piped to grep
- **WHEN** `find /src -name "*.ts" | grep import` is executed
- **THEN** find SHALL emit `FileRecord` entries that grep reads and filters

### Requirement: Error handling is deterministic for the SHFS subset
The command SHALL exit with status 0 on success and non-zero on errors. Missing starting paths, unsupported predicates/options, and invalid subset arguments SHALL produce deterministic SHFS errors. The command is not required to match GNU `find` wording or warning behavior.

#### Scenario: Non-existent starting path
- **WHEN** `find /nonexistent` is executed
- **THEN** the command SHALL report an error and exit with non-zero status

#### Scenario: Unsupported predicate
- **WHEN** an out-of-scope predicate such as `-mtime` is executed
- **THEN** the command SHALL report that the predicate is unsupported and exit with non-zero status
