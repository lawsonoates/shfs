# filesystem-adapter-contracts Specification

## Purpose
TBD - created by archiving change add-fs-rename-primitive. Update Purpose after archive.
## Requirements
### Requirement: Filesystem adapters expose a native rename primitive
The `FS` contract SHALL expose `rename(src, dest)` as a first-class operation for moving an existing filesystem entry to a new path within the same adapter.
The operation SHALL move the entry without requiring callers to reconstruct the move with separate read, write, and delete steps.

#### Scenario: Renaming a file preserves its content at the destination
- **WHEN** an adapter renames an existing file from `/docs/readme.md` to `/docs/guide.md`
- **THEN** `/docs/guide.md` exists with the same file bytes that were stored at the source path
- **AND** `/docs/readme.md` no longer exists after the rename completes

#### Scenario: Renaming a directory moves its descendant entries
- **WHEN** an adapter renames an existing directory from `/docs` to `/guides`
- **THEN** descendant entries that were reachable under `/docs/...` are reachable under `/guides/...`
- **AND** the original `/docs` subtree is no longer addressable after the rename completes

### Requirement: Rename uses deterministic validation and replacement rules
The `rename(src, dest)` operation SHALL fail if the source entry does not exist or if the destination parent directory does not exist.
The operation SHALL support replacing an existing destination file so higher-level callers can implement forced moves without reintroducing copy-and-delete behavior.
The operation SHALL reject invalid rename targets such as renaming the root path or replacing a non-empty destination directory.

#### Scenario: Missing source fails without creating the destination
- **WHEN** an adapter renames `/missing.txt` to `/dest.txt`
- **THEN** the operation fails with a missing-source error
- **AND** `/dest.txt` is not created as a side effect

#### Scenario: Existing destination file is replaced by rename
- **WHEN** an adapter renames `/source.txt` to `/dest.txt` and `/dest.txt` already exists as a file
- **THEN** `/dest.txt` contains the bytes from `/source.txt` after the rename completes
- **AND** `/source.txt` no longer exists after the rename completes

#### Scenario: Non-empty destination directory is rejected
- **WHEN** an adapter renames `/source.txt` to `/docs` and `/docs` already exists as a non-empty directory
- **THEN** the operation fails before mutating `/source.txt`
- **AND** the existing `/docs` subtree remains unchanged

