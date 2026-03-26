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

test('read subset: captures pipeline input into a variable for later statements in the same run', async () => {
	expect(await run('echo /workspace | read target; echo $target')).toBe(
		'/workspace'
	);
});

test('read subset: assigns empty pipeline input as an empty string and reports success', async () => {
	expect(await run('echo "" | read empty; echo $status:$empty')).toBe('0:');
});

test('read subset: consumes only the first record from stream input', async () => {
	await run('echo first > /tmp/read-first.txt');
	await run('echo second > /tmp/read-second.txt');

	expect(
		await run(
			'cat /tmp/read-first.txt /tmp/read-second.txt | read value; echo $value'
		)
	).toBe('first');
});

test('read subset: stores values in local scope for one run only', async () => {
	expect(await run('echo scoped | read local_only; echo $local_only')).toBe(
		'scoped'
	);
	expect(await run('echo $local_only')).toBe('');
});

test('read subset: reports failure status when no input stream is provided', async () => {
	await runNothrow('read missing');
	expect(await run('echo $status')).toBe('1');
	expect(await run('read missing; and echo pass; or echo fail')).toBe('fail');
});

test('read subset: requires exactly one variable name', async () => {
	await expect(run('read')).rejects.toThrow(REQUIRES_ONE_VARIABLE_NAME);
	await expect(run('read one two')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
});

test('read subset: fish read flags are out of scope', async () => {
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

test('read subset: validates variable names', async () => {
	await expect(run('echo value | read 1bad')).rejects.toThrow(
		'read: invalid variable name: 1bad'
	);
});
