**Note**: agents were used extensively to develop shfs.

# shfs

shfs (shell filesystem) is a simulated [fish shell](https://github.com/fish-shell/fish-shell) (subset) environment for executing filesystem-related commands.

Live demo: [shfs.lawsonoates.com](https://shfs.lawsonoates.com)

shfs is inspired by Bun's `$` shell api and provides a pluggable [filesystem interface](#filesystem-interface) allowing custom storage.

shfs is designed to be used by agents needing a filesystem without having to spin up a sandbox.

- Why fish? it's simple.
- Why a subset of fish? shfs is only for simulating a filesystem, only a subset is really needed.

The subset includes deterministic script features and filesystem commands needed for agent workflows.
More details are available in the [Subset Boundary](#subset-boundary), [Grammar](#grammar), and [Lexer Specification](packages/compiler/src/lexer/lexer-spec.md).

## Installation

```bash
bun add shfs
```

## Usage

```typescript
import { Shell } from "shfs";
import { MemoryFS } from "shfs/fs";

const fs = new MemoryFS();
fs.setFile("hello.txt", "hello world");

const { $ } = new Shell(fs);

const content = await $`cat hello.txt`.text();
console.log(content);
```

## Filesystem Interface

The shell runs over the `FS` interface exported from `shfs/fs`. `MemoryFS` is the built-in implementation; custom backends implement the same interface. See [docs/filesystem-interface.md](docs/filesystem-interface.md).

## Subset Boundary

shfs is fish-inspired but intentionally not a full fish shell. It targets deterministic behavior over a virtual filesystem.

Included behavior:

- fish list variables with indexing and slices (`$var`, `$var[1]`, `$var[2..-1]`, `count`)
- variable assignment (`set`, `set -g`/`-l`, erase `-e`, query `-q`, append/prepend `-a`/`-p`, slice assignment)
- command-scoped assignments (`name=value command`)
- command substitution (`(cmd)` and `$(cmd)`, including `$(cmd)` inside double quotes)
- multi-statement scripts with newline and `;`
- boolean chaining, combiners, and negation (`and`, `or`, `&&`, `||`, `not`, `!`, `$status`)
- control flow and blocks (`if`/`else if`/`else`, `while`, `for ... in`, `begin ... end`, `break`, `continue`)
- functions (`function name [-a names]` ... `end`, `$argv`, `return`)
- script-core builtins (`test`/`[`, `echo`, `read`, `string`, `true`, `false`, `count`)
- core path behavior (`cd`, `pwd`, `.`, `..`, absolute/relative paths)
- fish-style wildcard expansion (`*`, `?`, `[ ... ]`, `**`)
- symlink creation, traversal, and command semantics (`find -H`/`-L`/`-P`, `-type l`, `-xtype`, symlink-preserving recursive `cp`)
- stable, deterministic error contracts

Explicitly out of scope:

- `CDPATH`
- host OS/process emulation, job control, and interactive shell UX
- full fish compatibility or fish-verbatim error text

Canonical boundary doc: [notes/shfs-subset-boundary.md](notes/shfs-subset-boundary.md).

## Language Features

- variables are lists:
    - `set name a b c` stores three elements; `echo $name[2]` prints `b`
    - slices support ranges, negative indices, and open ends (`$name[2..-1]`, `$name[..2]`)
    - `set -g` persists across runs, `set -l` is block-local, unscoped `set` keeps the existing scope
    - `set -e name` erases, `set -q name` queries, `set -a`/`-p` append/prepend
    - `$status` exposes the last command status; `$argv` holds function arguments
    - unquoted list expansion yields one argument per element; quoted expansion joins with spaces; empty lists elide the word
- command substitution:
    - `(echo subdir)` and `$(echo subdir)` can be used as arguments
    - `$(cmd)` also works inside double quotes and preserves inner newlines
    - unquoted substitutions split output lines into arguments; output can be sliced (`(cmd)[2]`)
- script statements:
    - newline and semicolon statement separators
    - `and`/`or` keywords and `&&`/`||` combiners chain on the previous status
    - `not`/`!` negate a job's status
    - `if`/`else if`/`else`, `while`, `for ... in`, and `begin ... end` blocks with `break`/`continue`
    - `function name [-a names] ... end` defines functions with `$argv` and `return`
    - `name=value command` scopes an assignment to a single command
- quoting and expansion:
    - quoted wildcard text is treated literally
    - unquoted wildcard text is expanded for in-scope path arguments

## Supported Commands

Filesystem/path commands:

- cat
- cd
- cp
- find
- grep
- head
- ls
- mkdir
- mv
- pwd
- rm
- sort
- tail
- touch
- tree
- wc
- xargs

Script builtins:

- count
- echo
- false
- read
- set
- string
- test (and its `[` alias)
- true

Symlink-related command behavior:

- `find` supports the `-H`, `-L`, and `-P` link-following modes, plus the `-type l` and `-xtype` predicates
- `cp -r` preserves symlinks rather than following them
- there is no `ln` command; create symlinks via the [filesystem interface](#filesystem-interface)

## Globbing Semantics

For in-scope path-taking commands, unquoted wildcard patterns use fish-style expansion:

- supported pattern families: `*`, `?`, `[ ... ]`, `**`
- hidden files only match when explicitly requested (for example `.*`)
- trailing slash forms match directories (for example `*/`)
- quoted wildcard characters are literal text and are not expanded
- unmatched wildcard patterns fail with deterministic errors (`<command>: no matches found: <pattern>`)
- commands expecting one post-expansion path reject multi-match expansions with deterministic cardinality errors

## Agents

shfs is designed to be a tool used by agents to enable the benefits of a filesystem like progressive disclosure.

[Agent Tool Prompt](docs/agent-tool-prompt.md) is a prompt that can be used as a tool description for an agent.

## Grammar

```ebnf
program        ::= separator* statement (separator+ statement)* separator*
separator      ::= ";" | NEWLINE | COMMENT
statement      ::= chain_prefix? pipeline
chain_prefix   ::= "and" | "or"
pipeline       ::= command ("|" NEWLINE* command)*
command        ::= word command_part*
command_part   ::= word | redirection
redirection    ::= "<" word | ">" word | ">>" word
word           ::= word_part+
word_part      ::= literal | glob | substitution
substitution   ::= "(" program ")"
literal        ::= bare_text | single_quoted | double_quoted
single_quoted  ::= "'" single_quoted_text "'"
double_quoted  ::= '"' double_quoted_part* '"'
double_quoted_part ::= double_quoted_text | substitution
glob           ::= "*" | "?" | bracket_glob | "**"
```

Notes:

- words can mix literal text, glob parts, and command substitution in one token (for example `foo(echo bar)baz`)
- `$var` and `$status` are documented runtime expansion forms; they are preserved through parsing and expanded during execution

## License

MIT
