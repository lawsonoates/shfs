## MODIFIED Requirements

### Requirement: Unsupported wildcard policy for subset path arguments
The shell SHALL perform fish-style glob expansion for unquoted wildcard patterns in path-taking command arguments that are in scope for the subset.

#### Scenario: Unquoted wildcard expands for ls
- **WHEN** `ls *.txt` is executed in a directory containing `a.txt` and `b.txt`
- **THEN** `*.txt` is expanded to matching paths before `ls` runs

#### Scenario: Unquoted wildcard expands for other path-taking commands
- **WHEN** commands such as `rm -rf t*`, `touch f?.txt`, or `cd dir*` are executed and matches exist
- **THEN** wildcard arguments are expanded to matching paths before command execution

#### Scenario: Recursive wildcard expansion supports double-star patterns
- **WHEN** a command uses an unquoted `**` pattern such as `ls **/file_*`
- **THEN** matches are collected recursively according to fish-style glob semantics

#### Scenario: Hidden-file wildcard behavior follows fish-style rules
- **WHEN** wildcard patterns target hidden entries
- **THEN** hidden entries are matched only when the pattern explicitly includes dot-hidden semantics

#### Scenario: Trailing-slash wildcard behavior selects directories
- **WHEN** a wildcard pattern is expressed with a trailing slash form such as `*/`
- **THEN** expansion results include directory paths and exclude plain files

#### Scenario: Quoted wildcard characters remain literal
- **WHEN** wildcard characters are quoted in arguments
- **THEN** they are treated as literal text and SHALL NOT be expanded as patterns

#### Scenario: Unmatched wildcard reports deterministic failure
- **WHEN** an unquoted wildcard argument is evaluated and has no matches
- **THEN** execution fails with a deterministic wildcard/no-match error contract for the command

## ADDED Requirements

### Requirement: Out-of-scope constraints take precedence during glob evaluation
Glob expansion SHALL NOT enable capabilities that remain explicitly out of scope in the subset boundary.

#### Scenario: Symlink-focused behavior remains unsupported with globs
- **WHEN** a glob pattern would require symlink-specific traversal or symlink-focused behavior to match fish output
- **THEN** the shell reports deterministic unsupported behavior for that out-of-scope capability
- **THEN** wildcard support remains available for in-scope non-symlink cases
