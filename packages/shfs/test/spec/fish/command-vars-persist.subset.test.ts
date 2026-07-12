// Translated/adapted from fish-shell tests/checks/command-vars-persist.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/command-vars-persist.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Upstream runs `%fish -c 'set foo bar' -c 'echo $foo'`; separate `Shell.$`
// invocations on one Shell instance are the shfs equivalent of successive
// `-c` commands.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

// command-vars-persist.fish:1-2: variables set by one command are visible to
// the next; unscoped top-level `set` lands in the global scope.
test('fish command-vars-persist: command-vars-persist.fish - top-level set persists across invocations', async () => {
	await shell.$`set foo bar`.nothrow();
	expect(await shell.$`echo $foo`.text()).toBe('bar');
});
