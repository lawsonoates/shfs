// Translated/adapted from fish-shell tests/checks/read.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/read.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;
const REQUIRES_ONE_VARIABLE_NAME = 'read requires exactly one variable name';

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runNothrow(command: string): Promise<string> {
	return await shell.$`${command}`.nothrow().text();
}

test('fish read: read.fish - captures pipeline input into a variable for later statements in the same run', async () => {
	expect(await run('echo /workspace | read target; echo $target')).toBe(
		'/workspace'
	);
});

test('fish read: read.fish - assigns empty pipeline input as an empty string and reports success', async () => {
	expect(await run('echo "" | read empty; echo $status:$empty')).toBe('0:');
});

test('fish read: read.fish - consumes only the first record from stream input', async () => {
	await run('echo first > /tmp/read-first.txt');
	await run('echo second > /tmp/read-second.txt');

	expect(
		await run(
			'cat /tmp/read-first.txt /tmp/read-second.txt | read value; echo $value'
		)
	).toBe('first');
});

test('fish read: read.fish - stores values in local scope for one run only', async () => {
	expect(await run('echo scoped | read local_only; echo $local_only')).toBe(
		'scoped'
	);
	expect(await run('echo $local_only')).toBe('');
});

test('fish read: read.fish - reports failure status when no input stream is provided', async () => {
	await runNothrow('read missing');
	expect(await run('echo $status')).toBe('1');
	expect(await run('read missing; and echo pass; or echo fail')).toBe('fail');
});

test('fish read: read.fish - requires exactly one variable name', async () => {
	await expect(run('read')).rejects.toThrow(REQUIRES_ONE_VARIABLE_NAME);
	await expect(run('read one two')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
});

test('fish read: read.fish - fish read flags are out of scope', async () => {
	await expect(run('read -a values')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
	await expect(run('read -n 3 value')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
	await expect(run('read -z value')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
});

test('fish read: read.fish - validates variable names', async () => {
	await expect(run('echo value | read 1bad')).rejects.toThrow(
		'read: invalid variable name: 1bad'
	);
});

// read.fish lines 172-181 verify file-fed reads via `<$path`.
test('fish read: read.fish - input redirection feeds read from a file', async () => {
	await run('echo hello > /tmp/read-from-file.txt');
	expect(
		await run('read from_file </tmp/read-from-file.txt; echo $from_file')
	).toBe('hello');
});

// read.fish line 176 uses read from redirected stdin; include whitespace payload.
test('fish read: read.fish - input redirection preserves spaces for a single read variable', async () => {
	await run('echo "hello there" > /tmp/read-with-space.txt');
	expect(
		await run('read phrase < /tmp/read-with-space.txt; echo $phrase')
	).toBe('hello there');
});
