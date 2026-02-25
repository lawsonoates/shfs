# SHFS Subset Boundary (Decision)

`shfs` is a fish-inspired subset for deterministic, agent-friendly scripting over a virtual filesystem.  
It is not a full fish shell and does not target host OS parity.

## Included (must support)

- Variable expansion and assignment:
  - `$var`
  - `set` with local/global scope (`-l`, `-g`)
- Command substitution:
  - `(cmd)` executes and captures output
- Multi-statement scripts:
  - newline and `;` statement chaining
- Boolean chaining and status:
  - `and`, `or`, `$status`
- Script-core builtins:
  - `test`, `echo`, `read`, `string`
- Core path semantics:
  - `cd` / `pwd` with `.`, `..`, absolute and relative path handling
- Globbing and wildcard expansion (fish-style):
  - full pattern support for `*`, `?`, `[ ... ]`, and `**`
  - recursive glob behavior and trailing-slash directory matching semantics
  - hidden-file matching behavior consistent with fish glob rules
  - quoted wildcard characters are treated as literal text (no expansion)
  - parity target is fish glob behavior from `tests/checks/glob.fish`, limited by out-of-scope features below
- Stable error model:
  - deterministic errors (not fish-verbatim compatibility)

## Not Included (explicitly out of scope)

- Control flow blocks and function definitions:
  - `if` / `else` / `end`, `for` / `end`, `function` / `end`
- `CDPATH`
- Symlink support and symlink-focused commands/behavior
  - this remains out of scope even when a glob would otherwise match/traverse symlinks
- Permission model beyond basic virtual FS behavior
- `env KEY=... cmd` scoped environment injection
- Interactive shell features:
  - completion (`complete -C`), prompt/history behavior
  - dir stack UX (`prevd`, `nextd`)
  - variable event hooks (for example `--on-variable`)
- Host OS emulation / external process behavior:
  - `uname`, `sysctl`, `/bin/pwd`, job control, TTY/signal semantics
- Fish conformance goals:
  - full compatibility, fish-specific stack traces, fish-exact error wording

## Rule

If a feature is not listed under **Included**, treat it as out of scope for `shfs`.
Out-of-scope constraints take precedence over included features; adding glob support does not implicitly enable excluded capabilities.
