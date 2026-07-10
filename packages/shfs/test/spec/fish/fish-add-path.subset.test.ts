// Translated/adapted from fish-shell tests/checks/fish_add_path.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/fish_add_path.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// The upstream helper depends on brace and indirect expansion. This reduction
// preserves its command-assignment-to-function visibility contract.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// fish_add_path.fish:67-72: PATH=... fish_add_path ...
test('fish fish_add_path: fish_add_path.fish - command assignments are visible only during a function call', async () => {
	const script = [
		'function show',
		'    echo $token',
		'end',
		'token=scoped show',
		'echo "[$token]"',
	].join('\n');

	expect(await run(script)).toBe('scoped\n[]');
});
