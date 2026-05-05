**Note**: agents were used extensively to develop shfs.

# shfs

shfs (shell filesystem) is a simulated [fish shell](https://github.com/fish-shell/fish-shell) (subset) environment for executing filesystem-related commands.

Live demo: [shfs.lawsonoates.com](https://shfs.lawsonoates.com)

shfs is inspired by Bun's `$` shell api and provides a pluggable filesystem interface allowing custom storage.

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

## Subset Boundary

shfs is fish-inspired but intentionally not a full fish shell. It targets deterministic behavior over a virtual filesystem.

Included behavior:

- variable expansion and assignment (`$var`, `set -g`, `set -l`)
- command substitution (`(cmd)`)
- multi-statement scripts with newline and `;`
- boolean chaining and status (`and`, `or`, `$status`)
- script-core builtins (`test`, `echo`, `read`, `string`)
- core path behavior (`cd`, `pwd`, `.`, `..`, absolute/relative paths)
- fish-style wildcard expansion (`*`, `?`, `[ ... ]`, `**`)
- stable, deterministic error contracts

Explicitly out of scope:

- control-flow blocks and function definitions (`if`/`for`/`function` + `end`)
- `CDPATH`
- symlink-focused traversal/compat behavior
- host OS/process emulation and interactive shell UX
- full fish compatibility or fish-verbatim error text

Canonical boundary doc: [notes/shfs-subset-boundary.md](notes/shfs-subset-boundary.md).

## Language Features

- variables:
    - `set -g name value` persists across runs
    - `set -l name value` is local to one script run
    - `$status` exposes last command status (`0` success, `1` failure)
- command substitution:
    - `(echo subdir)` can be used as an argument
    - nested substitutions are supported
- script statements:
    - newline and semicolon statement separators
    - `and` and `or` chain statements based on previous status
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

- echo
- read
- set
- string
- test

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
