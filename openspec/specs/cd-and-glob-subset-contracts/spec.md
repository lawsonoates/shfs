# cd-and-glob-subset-contracts Specification

## Purpose
TBD - created by archiving change complete-cd-subset-steps-2-8. Update Purpose after archive.
## Requirements
### Requirement: Unsupported wildcard policy for subset path arguments
The shell SHALL reject unquoted wildcard patterns in subset path-taking command arguments and return a deterministic unsupported-glob error containing one of the keywords `glob`, `wildcard`, or `unsupported`.

#### Scenario: Unquoted wildcard rejected for ls
- **WHEN** `ls *.txt` is executed in the subset shell
- **THEN** execution fails with an unsupported-glob error message containing `glob`, `wildcard`, or `unsupported`

#### Scenario: Unquoted wildcard rejected for other path-taking commands
- **WHEN** commands such as `cd *`, `rm -rf t*`, or `touch f?.txt` are executed
- **THEN** execution fails with an unsupported-glob error message containing `glob`, `wildcard`, or `unsupported`

#### Scenario: Quoted wildcard characters remain literal
- **WHEN** wildcard characters are quoted in arguments
- **THEN** they are treated as literal text and not as patterns

### Requirement: Deterministic cd missing-directory contract
The `cd` command SHALL return deterministic subset error messaging for a missing directory target.

#### Scenario: Missing directory error message
- **WHEN** `cd /missing` is executed and the target directory does not exist
- **THEN** execution fails with the exact message `cd: directory does not exist: /missing`

### Requirement: Deterministic cd empty-path failure contract
The `cd` command SHALL treat an empty path argument as an error and set status to failure.

#### Scenario: Empty path fails and updates status
- **WHEN** `cd ""` is executed
- **THEN** execution fails with the message `cd: empty path`
- **THEN** `$status` is `1` for subsequent statements in the same run

