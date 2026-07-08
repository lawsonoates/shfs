// Translated/adapted from fish-shell tests/checks/zero_based_array.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/zero_based_array.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

const ZERO_INDEX_MESSAGE = 'array indices start at 1, not 0.';

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runResult(command: string) {
	const result = await shell.$`${command}`.nothrow();
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.text(),
	};
}

// zero_based_array.fish: echo $foo[0]
test('fish zero_based_array: zero_based_array.fish - index 0 is an error', async () => {
	const result = await runResult('echo $foo[0]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[ 0 ]
test('fish zero_based_array: zero_based_array.fish - index 0 with spaces is an error', async () => {
	const result = await runResult('echo $foo[ 0 ]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[ 00 ]
test('fish zero_based_array: zero_based_array.fish - index 00 is an error', async () => {
	const result = await runResult('echo $foo[ 00 ]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[+0]
test('fish zero_based_array: zero_based_array.fish - index +0 is an error', async () => {
	const result = await runResult('echo $foo[+0]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[-0]
test('fish zero_based_array: zero_based_array.fish - index -0 is an error', async () => {
	const result = await runResult('echo $foo[-0]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[0..1]
test('fish zero_based_array: zero_based_array.fish - range starting at 0 is an error', async () => {
	const result = await runResult('echo $foo[0..1]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[1..0]
test('fish zero_based_array: zero_based_array.fish - range ending at 0 is an error', async () => {
	const result = await runResult('echo $foo[1..0]');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(ZERO_INDEX_MESSAGE);
});

// zero_based_array.fish: echo $foo[001] still works
test('fish zero_based_array: zero_based_array.fish - leading zeros on positive indices work', async () => {
	expect(await run('set -l foo one two three\necho $foo[001]')).toBe('one');
});
