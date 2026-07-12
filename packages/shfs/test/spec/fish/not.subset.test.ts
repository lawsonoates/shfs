// Translated/adapted from fish-shell tests/checks/not.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/not.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream uses `sh -c 'exit 34'` to produce a custom status; shfs has
// no external commands, so a fish function with `return` produces the status
// instead. The `! -h`/`function !` documentation-and-override cases are out of
// scope (help output and overriding `!`).

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

// not.fish: not true; echo $status
test('fish not: not.fish - not inverts a successful command to status 1', async () => {
	expect(await run('not true\necho $status')).toBe('1');
});

// not.fish: not false has status 0
test('fish not: not.fish - not inverts a failing command to status 0', async () => {
	expect(await run('not false\necho $status')).toBe('0');
});

// not.fish: not not sh -c 'exit 34'; echo $status
// Adapted: double negation preserves the original non-zero status.
test('fish not: not.fish - two not prefixes cancel and preserve the status', async () => {
	const script = [
		'function exit_34',
		'    return 34',
		'end',
		'not not exit_34',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('34');
});

// not.fish: ! behaves like not in command position.
test('fish not: not.fish - ! is equivalent to not', async () => {
	expect(await run('! true\necho $status')).toBe('1');
	expect(await run('! false\necho $status')).toBe('0');
});
