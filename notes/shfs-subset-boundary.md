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
- Recursive file discovery with `find`:
  - starting paths or default current directory
  - deterministic recursive traversal over the virtual filesystem
  - predicates: `-name`, `-path`, `-type` (`f`, `d`)
  - traversal controls: `-maxdepth`, `-mindepth`, `-depth`
  - default `-print` action
  - deterministic errors for invalid predicates and arguments
  - pipeline-friendly behavior (`find ... | ...`)
- Directory tree rendering with `tree`:
  - deterministic recursive display over the virtual filesystem
  - listing controls: `-a`, `-d`, `-f`, `-F`, `-L`, `-A`, and `--noreport`
  - filtering controls: `-P`, `-I`, `--prune`, and `--matchdirs`
- Pattern search with `grep` (GNU-derived subset):
  - supported modes: basic/extended/fixed/PCRE (`-G`, `-E`, `-F`, `-P`)
  - binary-data handling flags: `--binary-files=binary|text|without-match`, `-a`, `-I`
  - default binary match reporting (`Binary file <path> matches`)
  - null-data record mode (`-z` / `--null-data`)
  - deterministic status behavior for match/no-match/error (`0`/`1`/`2`)
- Stream and file counting with `wc` (GNU-derived subset):
  - supported counts: bytes, characters, lines, words, and maximum line length
  - `--files0-from` and total modes for deterministic batch counting
- Stream and file sorting with `sort` (GNU-derived subset):
  - default C-locale/byte-style line ordering over stdin, file operands, and pipelines
  - numeric ordering with `-n`
  - key selection with `-k POS[,POS]`, including field and character offsets
  - field separator selection with `-t CHAR`
  - unique output and unique-aware check mode with `-u`
  - sortedness checks with `-c` and quiet checks with `-C`
  - deterministic status behavior for sorted, unsorted, and error cases
- Argument batching with `xargs` (GNU/POSIX-inspired subset):
  - supported options: `-0`/`--null`, `-d`, `-E`, `-I`, `-L`, `-n`, `-r`/`--no-run-if-empty`
  - default command is `echo` when no command is provided
  - batching controls `-n`, `-L`, and `-I` are mutually exclusive; last option wins
  - malformed quote/escape input is a deterministic parse failure
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
- Full GNU/POSIX `find` compatibility
  - metadata and host-identity predicates such as `-inum`, `-uid`, `-gid`, `-user`, `-group`, `-links`
  - GNU-specific input and formatting features such as `-files0-from` and `-printf`
  - command-execution and interactive actions such as `-execdir`, `-ok`, and `-okdir`
  - host/compatibility flags and warning modes such as `-warn`, `-nowarn`, `-D`, `POSIXLY_CORRECT`, and `-ignore_readdir_race`
  - advanced expression features such as grouping with `(` and `)`, `,`, and full boolean-expression compatibility
- Full GNU `grep` compatibility
  - only documented subset behavior is in scope
  - host/locale-specific edge-case parity beyond covered GNU-derived tests is out of scope
- Full GNU/POSIX `xargs` compatibility
  - only documented subset behavior is in scope
  - unsupported flags/modes and GNU warning/diagnostic parity are out of scope
- Full GNU `sort` compatibility
  - only documented subset behavior is in scope
  - locale-specific collation, month/version/random/human/general-numeric modes,
    merge-only mode, compression/temp/parallel tuning, debug annotations,
    `--files0-from`, `-z`, and `-o` output-file behavior are out of scope
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
