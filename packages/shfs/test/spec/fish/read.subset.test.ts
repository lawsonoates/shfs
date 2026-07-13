// Translated/adapted from fish-shell tests/checks/read.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/read.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

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

test('fish read: read.fish - reports failure status when no input stream is provided', async () => {
	await runNothrow('read missing');
	expect(await run('echo $status')).toBe('1');
	expect(await run('read missing; and echo pass; or echo fail')).toBe('fail');
});

test('fish read: read.fish - validates variable names', async () => {
	await expect(run('echo value | read 1bad')).rejects.toThrow(
		'read: invalid variable name: 1bad'
	);
});

// read.fish:391-398: read cannot target the read-only status variable.
test('fish read: read.fish - read status is a read-only variable error', async () => {
	await expect(run('echo foo | read status')).rejects.toThrow(
		'read: status: cannot overwrite read-only variable'
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

// read.fish:375-382 pipes three records into a block with sequential reads.
// A function replaces the upstream piped begin block, which is out of scope.
test('fish read: read.fish - sequential function reads share one stdin cursor', async () => {
	await run('echo first > /tmp/first.txt');
	await run('echo second > /tmp/second.txt');
	const script = [
		'function consume',
		'    read first',
		'    read second',
		'    echo $first:$second',
		'end',
		'cat /tmp/first.txt /tmp/second.txt | consume',
	].join('\n');

	expect(await run(script)).toBe('first:second');
});
