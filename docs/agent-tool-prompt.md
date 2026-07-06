Use this tool to execute filesystem-related fish shell commands.

--

Strict fish-inspired subset for filesystem commands. Not POSIX, not full fish. Deterministic, stream-based.

## Commands

- `cat`, `cd`, `cp`, `echo`, `find`, `grep`, `head`, `ls`, `mkdir`, `mv`, `pwd`, `read`, `rm`, `set`, `sort`, `string`, `tail`, `test`, `touch`, `tree`, `wc`, `xargs` (built-ins only, no external binaries, no `$PATH`)

## Supported

- **Pipelines**: `|` only, left-to-right, stream-based (newline allowed after `|` for line continuation)
- **find subset**: recursive virtual-FS traversal from explicit paths or cwd; link-following modes `-H`, `-L`, `-P`; tests `-name`/`-iname`, `-path`/`-ipath` (`-wholename`/`-iwholename`), `-regex`/`-iregex`, `-type f|d|l`, `-xtype`, `-empty`, `-true`/`-false`; `-maxdepth`, `-mindepth`, `-depth`, `-o`/`-or`, and default `-print`
- **tree subset**: deterministic directory rendering; supports `-a`, `-d`, `-f`, `-F`, `-L`, `-A`, `--noreport`, `-P`, `-I`, `--prune`, and `--matchdirs`
- **grep subset**: matchers `-G`, `-E`, `-F`, `-P`; matching flags `-i`, `-v`, `-w`, `-x`, `-e`, `-f`, `-m`; output flags `-n`, `-c`, `-o`, `-q`, `-b`, `-h`/`-H`, `-l`/`-L`, `-s`, context `-A`/`-B`/`-C`; recursive `-r`/`-R` with `--include`/`--exclude`/`--exclude-dir`; binary handling (`--binary-files=...`, `-a`, `-I`), null-data mode (`-z`/`--null-data`), and deterministic `0`/`1`/`2` status behavior
- **wc subset**: supports byte, character, line, word, and max-line-length counts, plus `--files0-from` and deterministic total modes
- **sort subset**: C-locale/byte-style line ordering over stdin/files/pipelines; supports `-n`, `-k POS[,POS]`, `-t CHAR`, `-u`, `-c`, and `-C`
- **xargs subset**: supports `-0`/`--null`, `-d`, `-E`, `-I`, `-L`, `-n`, `-r`/`--no-run-if-empty`; default command is `echo`; `-n`/`-L`/`-I` are mutually exclusive with last-flag-wins behavior
- **Statements**: multiple statements separated by newline or `;`
- **Quoting**: Single `'` (literal, no escapes), double `"` (allows `(command)` substitution, escapes `\"` and `\\` only)
- **Escapes**: `\` escapes next char outside quotes, line continuation at EOL; literal in single quotes
- **Command substitution**: `(command)` syntax (NOT `$()`), recursive, output trimmed/split on newlines
- **Globbing**: `*`, `**`, `?`, `[abc]`, `[a-z]`, `[!abc]`, trailing `/` for directory-only (no expansion in quotes, no-match = deterministic error)
- **Variables**: `$name` expansion, `$status` for last exit code; `set name value` to assign (`-l` local, `-g` global)
- **Chaining**: `and` (run if previous succeeded), `or` (run if previous failed)
- **Symlinks**: traversal and command semantics (`find` link modes and predicates, symlink-preserving recursive `cp`); no `ln` command — symlinks are created via the host filesystem API
- **Redirection**: `< file` (input), `> file` (output, overwrites), `>> file` (output, appends), noclobber forms `>?`/`>>?`, fd forms such as `2>&1` and `2>&-`, stderr pipe `&|`, and combined output forms `&>`/`&>>`
- **Comments**: `#` to EOL (only at token start)

## Not Supported

- Brace expansion (`{a,b,c}`)
- Control flow (`if`, `for`, `while`, `switch`, functions)
- `ln` (create symlinks through the filesystem API instead)
- `CDPATH`, scoped env injection (`env KEY=... cmd`), host OS/process emulation, external binaries, or `$PATH`
- Full GNU/POSIX/fish compatibility beyond the documented subsets
- Background `&`, `&&`/`||`, `not`, `~`, `$()`, heredocs, process substitution
