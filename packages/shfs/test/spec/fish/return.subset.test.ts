// Translated/adapted from fish-shell tests/checks/return.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/return.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream drives several cases through `$fish -c`; those run the same
// script text directly here. Negative status wrap-around checks that depend on
// `seq` are reduced to a representative case.

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

async function runResult(command: string) {
	const result = await shell.$`${command}`.nothrow();
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.text(),
	};
}

// return.fish: $fish -c 'return 5'; echo $status
test('fish return: return.fish - top-level return sets the script status', async () => {
	const result = await runResult('return 5');
	expect(result.exitCode).toBe(5);
});

// return.fish: $fish -c 'echo foo; return 2; echo bar'
test('fish return: return.fish - top-level return stops the script', async () => {
	const result = await runResult('echo foo; return 2; echo bar');
	expect(result.stdout).toBe('foo');
	expect(result.exitCode).toBe(2);
});

// return.fish: function empty_return; return $argv[1]; end
test('fish return: return.fish - return passes a status out of a function', async () => {
	const script = [
		'function empty_return',
		'    return $argv[1]',
		'end',
		'empty_return 5',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('5');
});

// return stops the function body.
test('fish return: return.fish - return stops the function body', async () => {
	const script = [
		'function f',
		'    echo foo',
		'    return 2',
		'    echo bar',
		'end',
		'f',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('foo\n2');
});

// return with no argument keeps the current status.
test('fish return: return.fish - bare return keeps the current status', async () => {
	const script = [
		'function f',
		'    false',
		'    return',
		'end',
		'f',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('1');
});

// return.fish: $fish -c "return 1 2"
test('fish return: return.fish - return with too many arguments is an error', async () => {
	const result = await runResult('return 1 2; echo unreachable');
	expect(result.exitCode).not.toBe(0);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('return: too many arguments');
});

// return.fish: $fish -c "return abc"
test('fish return: return.fish - return with a non-integer is an error', async () => {
	const result = await runResult('return abc; echo unreachable');
	expect(result.exitCode).not.toBe(0);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('return: abc: invalid integer');
});

// return.fish:145-156: negative return values wrap but never map to a
// $status of 0. Reduced from the `seq -- -550 -1` sweep to representative
// values, including the -256 multiple that wraps to 255.
test('fish return: return.fish - negative return values never map to 0', async () => {
	const script = [
		'function empty_return',
		'    return $argv[1]',
		'end',
		'for i in -5 -256 -512 -550',
		'    empty_return $i',
		'    echo $status',
		'end',
	].join('\n');
	expect(await run(script)).toBe('251\n255\n255\n218');
});
