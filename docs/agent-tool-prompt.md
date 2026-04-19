Use this tool to execute filesystem-related fish shell commands.

--

Strict fish-inspired subset for filesystem commands. Not POSIX, not full fish. Deterministic, stream-based.

## Commands

- `cat`, `cd`, `cp`, `echo`, `find`, `grep`, `head`, `ls`, `mkdir`, `mv`, `pwd`, `read`, `rm`, `set`, `string`, `tail`, `test`, `touch`, `xargs` (built-ins only, no external binaries, no `$PATH`)

## Supported

- **Pipelines**: `|` only, left-to-right, stream-based (newline allowed after `|` for line continuation)
- **xargs subset**: supports `-0`/`--null`, `-d`, `-E`, `-I`, `-L`, `-n`, `-r`/`--no-run-if-empty`; default command is `echo`; `-n`/`-L`/`-I` are mutually exclusive with last-flag-wins behavior
- **Statements**: multiple statements separated by newline or `;`
- **Quoting**: Single `'` (literal, no escapes), double `"` (allows `(command)` substitution, escapes `\"` and `\\` only)
- **Escapes**: `\` escapes next char outside quotes, line continuation at EOL; literal in single quotes
- **Command substitution**: `(command)` syntax (NOT `$()`), recursive, output trimmed/split on newlines
- **Globbing**: `*`, `**`, `?`, `[abc]`, `[a-z]`, `[!abc]`, trailing `/` for directory-only (no expansion in quotes, no-match = literal)
- **Variables**: `$name` expansion, `$status` for last exit code; `set name value` to assign (`-l` local, `-g` global)
- **Chaining**: `and` (run if previous succeeded), `or` (run if previous failed)
- **Redirection**: `< file` (input), `> file` (output, overwrites)
- **Comments**: `#` to EOL (only at token start)

## Not Supported

- Brace expansion (`{a,b,c}`)
- Control flow (`if`, `for`, `while`, `switch`, functions)
- `&`, `&&`/`||`, `not`, `~`, `$()`, `>>`, heredocs, process substitution
