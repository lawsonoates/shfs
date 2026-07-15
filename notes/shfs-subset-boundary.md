# SHFS Subset Boundary (Decision)

`shfs` is a fish-inspired subset for deterministic, agent-friendly scripting over a virtual filesystem.
It is not a full fish shell and does not target host OS parity.

This revision (2026-07-15) replaces the post-scripting-subset draft. It was
verified against the implementation (`packages/compiler` grammar and
`packages/shfs` registry/builtins) and against a runtime probe battery, not
inferred from older notes.

## Included (must support)

### Language and expansion

- Variable expansion and assignment:
  - `$var` with fish list semantics: element counts (`count`), indexing and
    slicing (`$var[1]`, `$var[2..-1]`, multiple ranges, open ranges), quoted
    join vs unquoted per-element expansion, empty-list word elision, and
    cartesian products of adjacent expansions; nested variables and command
    substitutions may supply index values and slice bounds
  - quoted PATH-like lists render with colon delimiters; PATH/CDPATH empty
    entries render as `.`, while MANPATH empty entries remain empty
  - `set` with `-l`/`-g`/unscoped assignment, erase (`-e`), query (`-q`),
    append/prepend (`-a`/`-p`), and index/slice assignment and erasure
  - command-scoped assignment prefixes (`name=value command`, PATH-like
    colon splitting), including prefixes on control-flow statements
  - `$status`, function-local `$argv`; `status` is read-only
- Command substitution:
  - `(cmd)` and `$(cmd)` execute and capture output; `$(cmd)` also inside
    double quotes; unquoted substitutions split output lines into arguments;
    substitution output can be sliced (`(cmd)[2]`); substitutions nest;
    explicit `string split`/`split0` fields survive without inferred
    trailing-newline trimming
- Multi-statement scripts:
  - newline and `;` statement chaining, comments (`#`), and fish-style
    character, byte, Unicode, octal, and line-continuation escapes
- Boolean chaining, combiners, and status:
  - `and`, `or`, `&&`, `||` (with newline continuation), `not`/`!` negation,
    `$status`
- Control flow and blocks:
  - `if`/`else if`/`else`/`end`, `switch`/`case`, `while`, `for ... in`,
    `begin ... end`, `break`, `continue` (fish block scoping for local
    variables; the `for` loop variable persists after the loop as in fish)
  - `switch` selects the first matching case with fish-style wildcard
    patterns, preserves incoming status until a selected body changes it, and
    rejects values that expand to multiple words
- Functions:
  - `function name [-a names]`/`end`, `$argv`, `return [status]`,
    function-local scope with caller-local isolation, reserved-keyword name
    rejection
  - function invocation participates fully in execution contexts:
    command-scoped assignments are visible inside the call, pipeline stdin is
    inherited by the body, explicit input redirection on the call overrides
    pipeline stdin, and sequential `read`s share one stdin cursor
- Globbing and wildcard expansion (fish-style):
  - full pattern support for `*`, `?`, `[ ... ]`, and `**`
  - recursive glob behavior and trailing-slash directory matching semantics
  - hidden-file matching behavior consistent with fish glob rules
  - quoted wildcard characters are treated as literal text (no expansion)
  - parity target is fish glob behavior from `tests/checks/glob.fish`, limited
    by out-of-scope features below

### Pipelines and redirection

- Pipelines with `|` between simple commands and function calls
- Output redirection: `> file`, append `>> file`, noclobber `>? file` and
  `>>? file` (writing over an existing file is a deterministic error)
- Input redirection: `< file`, optional-input `<? file`
- Stderr routing: `2> file`, merge `2>&1`, stderr-to-pipe `2>|`
- Descriptor duplication and closing: `>&2`, `>&-`, `<&-`, `<&N` forms
  supported by the parser; closed stdin is represented and reported (for
  example `read` fails deterministically on closed stdin)
- Redirection precedence: explicit redirects override pipeline defaults

### Shell state across invocations

- One `Shell` instance persists global variables, defined functions, `$status`,
  and the working directory across separate `Shell.$` invocations
- Each invocation gets fresh local frames and fresh stdin

### Builtins (fish-derived)

- `echo` with fish-style `-n`, `-s`, `-e`, and `-E` option parsing, combined
  flags, escape decoding, and newline suppression; `true`, `false`, `count`
  (arguments plus stdin physical lines when piped, as in fish)
- `test` and its `[` alias: string/numeric/file predicates, `!`, `-a`/`-o`,
  and fish's `test-require-arg` behavior (missing operands are errors; bare
  `-n`/`-z` treat the missing operand as empty)
- `read NAME`: exactly one variable name, consuming one physical line from
  pipeline stdin or `< file` input while leaving unread input available to
  later consumers; deterministic error on closed stdin
- `string` subcommands: `match` (`-q`, `-v`, `-r`; glob or regex patterns),
  `replace` (literal or `-r` regex replacement, `-a`/`--all`, capture
  references and case conversion), `length`, `sub` (`-s`, `-l`, `-e`),
  `split`, `split0`, `join`, `trim`, `repeat`, `lower`, `upper`
- `set` as described under variables
- `cd` / `pwd` with `.`, `..`, absolute and relative path handling; `cd`
  without arguments goes to the filesystem root (there is no `$HOME`)

### Filesystem and stream commands (GNU-inspired deterministic subsets)

- File management actions: `cp` (`-r`, `-f`, `-i`), `mv` (`-f`, `-i`),
  `mkdir` (`-p`), `rm` (`-r`, `-f`, `-i`), `touch` (`-a`, `-m`)
- Listing and reading: `ls` (`-a`, `-l`), `cat` (numbering/ends/tabs/squeeze
  display flags), `head` / `tail` (`-n`, files or stdin); plain file replay
  and stdin line selection preserve exact bytes and final-line termination,
  and partial stdin consumers leave the unread suffix available
- Recursive file discovery with `find`:
  - starting paths or default current directory
  - deterministic recursive traversal over the virtual filesystem
  - predicates: `-name`, `-iname`, `-path`, `-type` (`f`, `d`)
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

### Error model

- Stable, deterministic errors (not fish-verbatim compatibility); unknown
  commands fail with status 127

## Not Included (explicitly out of scope)

### Language

- `eval`, `source`, brace expansion (`{a,b}`), tilde expansion, and indirect
  variable expansion (`$$name`)
- Blocks as pipeline components or redirection targets
  (`begin ... end | cmd`, `cmd | begin ... end`, `begin ... end > file`),
  and brace command blocks (`{ ...; }`)
- `$pipestatus` and pipeline process-group/buffering semantics
- Exported (`-x`/`-u`) and universal (`-U`) variables, path/unpath variable
  flags, variable event hooks, `set --show`
- `exit` as a command (scripts end by falling off the end; `return` exits
  functions)
- Fish special variables beyond `$status`/`$argv` (for example `$HOME`,
  `$hostname`, `$fish_pid`, `$history`, `$umask`)

### Builtins and commands

- Command-resolution and introspection helpers: `command`, `builtin`, `type`,
  `functions`, `alias`, `abbr`, `status`, `time`
- Additional fish builtins: `argparse`, `contains`, `math`, `path`, `printf`,
  `random`, `realpath`, `set_color`, `ulimit`, `umask`, `version`, `psub`
- `read` flags and multi-variable forms (`-l`/`-g`, `-n`, `-z`, `-d`,
  `--list`, prompts, multiple names)
- `string` subcommands and flags beyond the documented set: `escape`,
  `unescape`, `collect`, `pad`, `shorten`, `join0`, regex indexes/groups-only,
  replace filtering/max-matches, and visible-width/color handling
- `cd -`, `$CDPATH`-based lookup, `$HOME`-relative `cd`, `prevd`/`nextd`,
  `pwd -P`/`-L`

### Environment and host behavior

- Symlink support and symlink-focused commands/behavior
  - this remains out of scope even when a glob would otherwise match/traverse symlinks
- Permission model beyond basic virtual FS behavior
- The `env` command (command-scoped assignment uses the fish
  `name=value cmd` form instead)
- Interactive shell features: completion (`complete -C`), prompt/history
  behavior, dir stack UX, key bindings, variable event hooks
- Host OS emulation / external process behavior: external command lookup,
  `exec`, shebangs, `uname`, `sysctl`, `/bin/pwd`, job control, background
  jobs (`&`), signals/traps, TTY semantics
- Locale, terminal-width, and color/formatting behavior
- Startup/config/environment initialization (config files, XDG paths,
  `fish_add_path`, universal variable storage)

### GNU tool parity limits

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

### Diagnostics

- Fish conformance goals: full compatibility, fish-specific stack traces,
  fish-exact error wording, localized messages, caret spans

## Rule

If a feature is not listed under **Included**, treat it as out of scope for `shfs`.
Out-of-scope constraints take precedence over included features; adding glob support does not implicitly enable excluded capabilities.
