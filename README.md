# vsh

vsh (virtual shell) is a simulated fish shell (subset) environment for executing filesystem-related commands.

vsh is inspired by Bun's `$` shell api and provides a pluggable filesystem interface allowing custom storage.

vsh is designed to be used by agents needing a filesystem without having to spin up a sandbox.

- why fish? it's simple.
- why a subset of fish? vsh is only for simulating a filesystem, only a subset is really needed.

The subset includes the commands listed in [Supported Commands](#supported-commands) section and has a simplified grammar (no variables, no functions, no heredocs). More details in the [Grammar](#grammar) section and the [Lexer Specification](packages/compiler/src/lexer/lexer-spec.md).

## Installation

```bash
bun add vsh
```

## Usage

```typescript
import { Shell } from 'vsh';
import { MemoryFS } from 'vsh/fs';

const fs = new MemoryFS();
fs.setFile('hello.txt', 'hello world');

const { $ } = new Shell(fs);

const content = await $`cat hello.txt`.text();
console.log(content);
```

## Agents

vsh is designed to be a tool used by agents to enable the benefits of a filesystem like progressive disclosure.

TODO: prompt for agent tool

## Supported Commands
- cat
- cp
- head
- ls
- mkdir
- mv
- rm
- tail
- touch

## Grammar

```ebnf
program      ::= pipeline
pipeline     ::= command ("|" command)*
command      ::= word+
word         ::= quoted | unquoted | substitution
quoted       ::= "'" .* "'" | '"' .* '"'
substitution ::= "(" program ")"
```

## License

MIT