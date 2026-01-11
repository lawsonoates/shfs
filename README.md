# vsh

vsh (virtual shell) is a library of simulated bash commands and is inspired by Bun's `$` shell api.

vsh supports a pluggable filesystem allowing custom storage.

vsh is designed to be used by agents needing a filesystem without having to spin up a sandbox.

## Installation

```bash
bun install vsh
```

## Usage

```typescript
import { Shell } from 'vsh';

const { $ } = new Shell();

const content = await $`tail -n 10 logs.txt`.text();
console.log(content);
```