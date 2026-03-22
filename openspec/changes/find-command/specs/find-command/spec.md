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

#### Scenario: Pattern with slash warns
- **WHEN** `-name` is given a pattern containing `/`
- **THEN** the command SHALL emit a warning that `-name` matches basenames only and the `/` will not match

### Requirement: Path predicate matches full path with glob
The `-path <pattern>` predicate SHALL match against the full path of each entry using glob semantics.

#### Scenario: Full path glob match
- **WHEN** `find / -path "*/src/*.ts"` is executed
- **THEN** only entries whose full path matches the pattern SHALL be emitted

### Requirement: Type predicate filters by entry type
The `-type <typechars>` predicate SHALL filter entries by type. Supported type characters: `f` (regular file), `d` (directory). Unknown type characters SHALL produce an error.

#### Scenario: Filter files only
- **WHEN** `find /src -type f` is executed
- **THEN** only regular files SHALL be emitted (no directories)

#### Scenario: Filter directories only
- **WHEN** `find /src -type d` is executed
- **THEN** only directories SHALL be emitted

#### Scenario: Invalid type character
- **WHEN** `find /src -type z` is executed
- **THEN** the command SHALL report an error about the unknown type argument

### Requirement: Time predicates filter by modification time
The `-mtime <n>` predicate SHALL filter entries by modification time measured in 24-hour periods. `+n` means more than n days ago, `-n` means less than n days ago, `n` means exactly n days ago. `-atime` and `-ctime` SHALL follow the same semantics for access and change time respectively.

#### Scenario: Files modified more than 7 days ago
- **WHEN** `find / -mtime +7` is executed
- **THEN** only entries with mtime more than 7*24 hours ago SHALL be emitted

#### Scenario: Newer-than reference file
- **WHEN** `find / -newer /ref` is executed
- **THEN** only entries with mtime newer than `/ref`'s mtime SHALL be emitted

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
If no action is specified, `find` SHALL use `-print` as the default action, emitting each matching path as a `FileRecord`.

#### Scenario: Implicit print
- **WHEN** `find /src -name "*.ts"` is executed with no explicit action
- **THEN** matching paths SHALL be emitted as `FileRecord` entries

### Requirement: Printf action formats output
The `-printf <format>` action SHALL format output using directives: `%p` (path), `%f` (basename), `%h` (parent directory), `%s` (size), `%T+` (modification time), `%d` (depth), `\\n` (newline), `\\t` (tab), and `%%` (literal percent).

#### Scenario: Printf with path and basename
- **WHEN** `find /src -printf "%p %f\n"` is executed
- **THEN** each match SHALL be formatted with full path, space, basename, and newline

### Requirement: Exec action runs commands per file
The `-exec cmd {} \;` action SHALL execute `cmd` once per matching entry, replacing `{}` with the entry's path. The `-exec cmd {} +` form SHALL batch entries and execute `cmd` with all paths appended as arguments.

#### Scenario: Exec per file
- **WHEN** `find /src -name "*.ts" -exec echo {} \;` is executed
- **THEN** `echo` SHALL be called once for each matching file with its path as argument

#### Scenario: Exec batch mode
- **WHEN** `find /src -name "*.ts" -exec echo {} +` is executed
- **THEN** `echo` SHALL be called with all matching paths as arguments in a single invocation

### Requirement: Execdir action runs commands from file's directory
The `-execdir cmd {} \;` action SHALL execute `cmd` from the parent directory of each matching entry, replacing `{}` with `./basename`.

#### Scenario: Execdir changes directory
- **WHEN** `find /src -execdir echo {} \;` is executed on file `/src/a/b.ts`
- **THEN** `echo` SHALL be called with `./b.ts` from working directory `/src/a`

### Requirement: Files0-from reads starting paths from file
The `-files0-from <file>` option SHALL read null-terminated paths from the specified file and use them as starting paths instead of command-line arguments.

#### Scenario: Read paths from null-terminated file
- **WHEN** `find -files0-from /paths.txt` is executed where `/paths.txt` contains `/a\0/b\0`
- **THEN** the command SHALL traverse `/a` and `/b` as starting paths

### Requirement: Metadata predicates filter by inode and ownership
`-inum <n>` SHALL filter by inode number. `-uid <n>` SHALL filter by user ID. `-gid <n>` SHALL filter by group ID. `-user <name>` SHALL filter by user name. `-group <name>` SHALL filter by group name.

#### Scenario: Filter by inode
- **WHEN** `find / -inum 12345` is executed
- **THEN** only entries with inode number 12345 SHALL be emitted

### Requirement: Find compiler produces FindStep IR
The compiler SHALL parse `find` arguments into a `FindStep` IR containing: starting paths as `ExpandedWord[]`, an ordered array of predicates, traversal options, and an action specification. The `FindStep` SHALL be part of the `StepIR` union.

#### Scenario: Compiler output for simple find
- **WHEN** `find /src -name "*.ts" -type f` is compiled
- **THEN** the resulting IR SHALL contain starting path `/src`, a name predicate with pattern `*.ts`, and a type predicate with value `f`

### Requirement: Find operator emits FileRecord stream
The find runtime operator SHALL be a transducer that accepts the `FindStep` IR and yields `FileRecord` entries for each matching path. It SHALL be composable in pipelines.

#### Scenario: Piped to grep
- **WHEN** `find /src -name "*.ts" | grep import` is executed
- **THEN** find SHALL emit `FileRecord` entries that grep reads and filters

### Requirement: Error handling follows GNU find conventions
The command SHALL exit with status 0 on success and non-zero on errors. Missing starting paths SHALL produce an error message. Permission errors on directories SHALL be reported to stderr but SHALL NOT halt traversal of other paths.

#### Scenario: Non-existent starting path
- **WHEN** `find /nonexistent` is executed
- **THEN** the command SHALL report an error and exit with non-zero status

#### Scenario: Permission error continues traversal
- **WHEN** a directory within the traversal cannot be read
- **THEN** the error SHALL be reported to stderr and traversal SHALL continue with remaining paths
