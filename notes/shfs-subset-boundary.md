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
- Stable error model:
  - deterministic errors (not fish-verbatim compatibility)

## Not Included (explicitly out of scope)

- Globbing and wildcard expansion:
  - `*`, `?`, `[ ... ]`, `**`
  - unquoted wildcard tokens are invalid and must fail with an unsupported-feature error
  - quoted wildcard characters are treated as ordinary literal text
- Control flow blocks and function definitions:
  - `if` / `else` / `end`, `for` / `end`, `function` / `end`
- `CDPATH`
- Symlink support and symlink-focused commands/behavior
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
