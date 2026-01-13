**Note**: agents were used extensively to develop shfs.

# shfs

shfs (shell filesystem) is a simulated [fish shell](https://github.com/fish-shell/fish-shell) (subset) environment for executing filesystem-related commands.

shfs is inspired by Bun's `$` shell api and provides a pluggable filesystem interface allowing custom storage.

shfs is designed to be used by agents needing a filesystem without having to spin up a sandbox.

- Why fish? it's simple.
- Why a subset of fish? shfs is only for simulating a filesystem, only a subset is really needed.

The subset includes the commands listed in [Supported Commands](#supported-commands) section and has a simplified grammar (no variables, no functions, no heredocs). More details available in the [Grammar](#grammar) section and the [Lexer Specification](packages/compiler/src/lexer/lexer-spec.md).

## Installation

```bash
bun add shfs
```

## Usage

```typescript
import { Shell } from 'shfs';
import { MemoryFS } from 'shfs/fs';

const fs = new MemoryFS();
fs.setFile('hello.txt', 'hello world');

const { $ } = new Shell(fs);

const content = await $`cat hello.txt`.text();
console.log(content);
```

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

## Agents

shfs is designed to be a tool used by agents to enable the benefits of a filesystem like progressive disclosure.

[Agent Tool Prompt](docs/agent-tool-prompt.md) is a prompt that can be used as a tool description for an agent.

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