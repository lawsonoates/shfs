// Translated/adapted from fish-shell tests/checks/test.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/test.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream runs with the `test-require-arg` feature, which this port
// follows: missing operands are deterministic errors instead of silent
// truthiness checks (except -n/-z, which treat the missing operand as "").
// Symlink (-ef via ln), permission (-x), and pre-epoch mtime cases are out of
// scope; file identity and -nt/-ot are covered through the virtual FS.

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

// test.fish: numeric comparison operators.
test('fish test: test.fish - numeric comparison operators', async () => {
	expect(await run('test 5 -eq 5; echo $status')).toBe('0');
	expect(await run('test 5 -ne 5; echo $status')).toBe('1');
	expect(await run('test 2 -gt 1; echo $status')).toBe('0');
	expect(await run('test 1 -gt 2; echo $status')).toBe('1');
	expect(await run('test 5 -ge 5; echo $status')).toBe('0');
	expect(await run('test 1 -lt 2; echo $status')).toBe('0');
	expect(await run('test 2 -le 1; echo $status')).toBe('1');
});

// test.fish: test inf -gt 0
test('fish test: test.fish - infinite numbers are an error', async () => {
	const result = await runResult('test inf -gt 0');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('Number is infinite');
});

// test.fish: test 5 -eq nan
test('fish test: test.fish - NaN is an error', async () => {
	const result = await runResult('test 5 -eq nan');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('Not a number');
});

// test.fish: test -z nan || echo nan is fine
test('fish test: test.fish - nan is an ordinary string for -z', async () => {
	expect(await run('test -z nan || echo nan is fine')).toBe('nan is fine');
});

// test.fish: test 1 =
test('fish test: test.fish - missing operand after = is an error', async () => {
	const result = await runResult('test 1 =');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('test: Missing argument at index 3');
});

// test.fish: test 1 = 2 and echo true or echo false
test('fish test: test.fish - words after a complete expression need a combiner', async () => {
	const result = await runResult('test 1 = 2 and echo true or echo false');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"test: Expected a combining operator like '-a' at index 4"
	);
});

// test.fish: function t; test $argv[1] -eq 5; end; t foo
test('fish test: test.fish - non-numeric argument to -eq is an error', async () => {
	const script = [
		'function t',
		'    test $argv[1] -eq 5',
		'end',
		't foo',
	].join('\n');
	const result = await runResult(script);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Argument is not a number: 'foo'");
});

// test.fish: t 5,2
test('fish test: test.fish - trailing garbage after an integer is an error', async () => {
	const script = [
		'function t',
		'    test $argv[1] -eq 5',
		'end',
		't 5,2',
	].join('\n');
	const result = await runResult(script);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Integer 5 in '5,2' followed by non-digit");
});

// test.fish: test -x /usr/bin/go /usr/local/bin/go (adapted to -d)
test('fish test: test.fish - unexpected extra argument is an error', async () => {
	const result = await runResult('test -d /usr /usr/local');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"test: unexpected argument at index 3: '/usr/local'"
	);
});

// test.fish: test $file -nt nonexist / test nonexist -ot $file
test('fish test: test.fish - -nt and -ot against missing files', async () => {
	await run('echo data > file');
	expect(
		await run('test file -nt nonexist && echo good nt || echo bad nt')
	).toBe('good nt');
	expect(
		await run('test nonexist -ot file && echo good ot || echo bad ot')
	).toBe('good ot');
});

// test.fish: test epoch -ef old / epochlink (adapted: same path vs other path)
test('fish test: test.fish - -ef compares file identity', async () => {
	await run('echo a > f1');
	await run('echo b > f2');
	expect(await run('test f1 -ef f1 && echo good ef || echo bad ef')).toBe(
		'good ef'
	);
	expect(await run('test f1 -ef f2 && echo bad ef || echo good ef')).toBe(
		'good ef'
	);
});

// test.fish: test -n → 1, test -z → 0 (missing operand treated as empty)
test('fish test: test.fish - bare -n and -z treat the missing operand as empty', async () => {
	expect(await run('test -n; echo $status')).toBe('1');
	expect(await run('test -z; echo $status')).toBe('0');
});

// test.fish: test -d (missing operand)
test('fish test: test.fish - unary file predicate without operand is an error', async () => {
	const result = await runResult('test -d');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('test: Missing argument at index 2');
});

// test.fish: test foo / test ""
test('fish test: test.fish - a single operand is a missing-argument error', async () => {
	for (const command of ['test foo', 'test ""']) {
		const result = await runResult(command);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('test: Missing argument at index 2');
	}
});

// test.fish: test -z "" -a foo; echo $status → 1
test('fish test: test.fish - trailing operand after a combiner is an error with status 1', async () => {
	const result = await runResult('test -z "" -a foo\necho $status');
	expect(result.stderr).toContain('test: Missing argument at index 5');
	expect(result.stdout).toBe('1');
});

// test.fish: test (no arguments)
test('fish test: test.fish - no arguments is an error', async () => {
	const result = await runResult('test');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('test: Expected at least one argument');
});

// test.fish: [ -z (missing closing bracket)
test('fish test: test.fish - [ requires a closing bracket', async () => {
	const result = await runResult('[ -z');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("[: the last argument must be ']'");
});

// [ form evaluates like test.
test('fish test: test.fish - [ evaluates its expression like test', async () => {
	expect(await run('[ foo = foo ]; echo $status')).toBe('0');
	expect(await run('[ foo = bar ]; echo $status')).toBe('1');
	expect(await run('[ 5 -ge 3 ]; echo $status')).toBe('0');
});

// String predicates.
test('fish test: test.fish - -n and -z string predicates', async () => {
	expect(await run('test -n "abc"; echo $status')).toBe('0');
	expect(await run('test -n ""; echo $status')).toBe('1');
	expect(await run('test -z ""; echo $status')).toBe('0');
	expect(await run('test -z "abc"; echo $status')).toBe('1');
});

// File predicates over the virtual filesystem.
test('fish test: test.fish - file predicates -e -f -d -s', async () => {
	await run('mkdir /dir');
	await run('echo content > /dir/file');
	await run('touch /dir/empty');
	expect(await run('test -e /dir/file; echo $status')).toBe('0');
	expect(await run('test -e /dir/missing; echo $status')).toBe('1');
	expect(await run('test -f /dir/file; echo $status')).toBe('0');
	expect(await run('test -f /dir; echo $status')).toBe('1');
	expect(await run('test -d /dir; echo $status')).toBe('0');
	expect(await run('test -d /dir/file; echo $status')).toBe('1');
	expect(await run('test -s /dir/file; echo $status')).toBe('0');
	expect(await run('test -s /dir/empty; echo $status')).toBe('1');
});

// Negation and combiners.
test('fish test: test.fish - ! negates an expression', async () => {
	expect(await run('test ! -n "abc"; echo $status')).toBe('1');
	expect(await run('test ! -z "abc"; echo $status')).toBe('0');
	expect(await run('test ! foo = bar; echo $status')).toBe('0');
});

test('fish test: test.fish - -a and -o combine expressions', async () => {
	expect(await run('test a = a -a b = b; echo $status')).toBe('0');
	expect(await run('test a = a -a b = c; echo $status')).toBe('1');
	expect(await run('test a = a -o b = c; echo $status')).toBe('0');
	expect(await run('test a = b -o b = c; echo $status')).toBe('1');
});

// Variables and command substitutions expand into operands.
test('fish test: test.fish - operands come from expansions', async () => {
	await run('set -g left alpha');
	expect(
		await run('test $left = (echo alpha); and echo match; or echo mismatch')
	).toBe('match');
});

// test emits nothing on success or failure.
test('fish test: test.fish - test emits no output', async () => {
	expect(await run('test alpha = alpha')).toBe('');
	const result = await runResult('test alpha = beta');
	expect(result.stdout).toBe('');
});
