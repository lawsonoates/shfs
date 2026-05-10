// Translated/adapted from fish-shell tests/checks/test.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/test.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../../../packages/shfs/src/fs/memory';
import { Shell } from '../../../../packages/shfs/src/shell/shell';

let shell!: Shell;
const UNSUPPORTED_TEST_ARGS_MESSAGE = 'test: unsupported arguments';

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runNothrow(command: string): Promise<string> {
	return await shell.$`${command}`.nothrow().text();
}

test('fish test: test.fish - supports one-operand truthiness checks', async () => {
	expect(await run('test fish; and echo pass; or echo fail')).toBe('pass');
	expect(await run('test ""; and echo pass; or echo fail')).toBe('fail');
});

test('fish test: test.fish - exposes test result through $status as 0/1', async () => {
	await run('test fish');
	expect(await run('echo $status')).toBe('0');

	await runNothrow('test ""');
	expect(await run('echo $status')).toBe('1');
});

test('fish test: test.fish - supports string = and != comparisons', async () => {
	expect(await run('test alpha = alpha; and echo yes; or echo no')).toBe(
		'yes'
	);
	expect(await run('test alpha = beta; and echo yes; or echo no')).toBe('no');
	expect(await run('test alpha != beta; and echo yes; or echo no')).toBe(
		'yes'
	);
	expect(await run('test alpha != alpha; and echo yes; or echo no')).toBe(
		'no'
	);
});

test('fish test: test.fish - supports variable and command substitution in operands', async () => {
	await run('set -g left alpha');
	await run('set -g right alpha');

	expect(
		await run(
			'test $left = (echo $right); and echo match; or echo mismatch'
		)
	).toBe('match');
});

test('fish test: test.fish - test command itself emits no output', async () => {
	expect(await run('test alpha = alpha')).toBe('');
	expect(await runNothrow('test alpha = beta')).toBe('');
});

test('fish test: test.fish - requires at least one operand', async () => {
	await expect(run('test')).rejects.toThrow('test requires operands');
});

test('fish test: test.fish - unsupported fish test operators are out of scope', async () => {
	await expect(run('test 5 -eq 5')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test 2 -gt 1')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test -z value')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test -n value')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test -d /workspace')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test -x /workspace/tool')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a -nt b')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a -ot b')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a -ef b')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
});

test('fish test: test.fish - unsupported expression arities and combiners are out of scope', async () => {
	await expect(run('test 1 =')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a = b c')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a = a -a b = b')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
	await expect(run('test a = a -o b = c')).rejects.toThrow(
		UNSUPPORTED_TEST_ARGS_MESSAGE
	);
});
