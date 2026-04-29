// Translated/adapted from fish-shell tests/checks/expansion.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/expansion.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish expansion.fish covers brace expansion, slices, tilde expansion,
// path variables, indirect variable expansion ($$), and more. Most of these
// are out of scope for shfs. This subset covers only the variable expansion
// and quoting behaviors that fall within the shfs subset boundary.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runWithStatus(
	command: string
): Promise<{ output: string; stderr: string; status: number }> {
	const result = await shell.$`${command}`.nothrow();
	return {
		output: result.text(),
		stderr: result.stderr.toString(),
		status: result.exitCode,
	};
}

// expansion.fish: echo {apple,orange}
// Brace expansion is out of scope for shfs.

// expansion.fish: set -l foo; expansion "$foo"; expansion $foo
// Tests empty variable expansion behavior.
test('fish expansion: expansion.fish - double-quoted empty variable expands to empty string', async () => {
	expect(await run('set -l foo; echo "$foo"')).toBe('');
});

test('fish expansion: expansion.fish - unquoted empty variable expands to empty string', async () => {
	expect(await run('set -l foo; echo $foo')).toBe('');
});

// expansion.fish: set -l foo; expansion "prefix$foo"; expansion prefix$foo
test('fish expansion: expansion.fish - double-quoted prefix with empty variable keeps prefix', async () => {
	expect(await run('set -l foo; echo "prefix$foo"')).toBe('prefix');
});

test('fish expansion: expansion.fish - unquoted prefix with empty variable keeps prefix', async () => {
	expect(await run('set -l foo; echo prefix$foo')).toBe('prefix');
});

// expansion.fish: set -l foo ''; expansion "$foo"; expansion $foo
test('fish expansion: expansion.fish - double-quoted variable set to empty string expands to empty', async () => {
	expect(await run('set -l foo \'\'; echo "$foo"')).toBe('');
});

test('fish expansion: expansion.fish - unquoted variable set to empty string expands to empty', async () => {
	expect(await run("set -l foo ''; echo $foo")).toBe('');
});

// expansion.fish: set -l foo ''; expansion "prefix$foo"; expansion prefix$foo
test('fish expansion: expansion.fish - prefix with variable set to empty string keeps prefix', async () => {
	expect(await run('set -l foo \'\'; echo "prefix$foo"')).toBe('prefix');
});

// expansion.fish: set -l foo bar; set -l bar baz; expansion "$$foo"
// Indirect expansion ($$) is out of scope for shfs.

// Variable expansion with command substitution.
test('fish expansion: expansion.fish - variable expansion inside command substitution', async () => {
	await run('set -g name world');
	expect(await run('echo (echo $name)')).toBe('world');
});

// Variable expansion concatenated with literal text.
test('fish expansion: expansion.fish - variable expansion concatenated with suffix', async () => {
	await run('set -g base file');
	expect(await run('echo $base.txt')).toBe('file.txt');
});

test('fish expansion: expansion.fish - variable expansion in double quotes with surrounding text', async () => {
	await run('set -g greeting hello');
	expect(await run('echo "say $greeting please"')).toBe('say hello please');
});

// Variable set via command substitution, then expanded.
test('fish expansion: expansion.fish - variable assigned from command substitution expands correctly', async () => {
	expect(await run('set -l val (echo dynamic); echo "result: $val"')).toBe(
		'result: dynamic'
	);
});

// Multiple variables in one expansion.
test('fish expansion: expansion.fish - multiple variable expansions in one string', async () => {
	await run('set -g first hello');
	await run('set -g second world');
	expect(await run('echo "$first $second"')).toBe('hello world');
});

// Variable expansion with adjacent command substitution.
test('fish expansion: expansion.fish - variable expansion adjacent to command substitution', async () => {
	await run('set -g prefix pre');
	expect(await run('echo "$prefix"(echo fix)')).toBe('prefix');
});

// Undefined variable expands to empty.
test('fish expansion: expansion.fish - undefined variable expands to empty in double quotes', async () => {
	expect(await run('echo "value:$undefined"')).toBe('value:');
});

test('fish expansion: expansion.fish - undefined variable expands to empty unquoted', async () => {
	expect(await run('echo value:$undefined')).toBe('value:');
});

// expansion.fish lines 4-13 use nested fish execution with `... 2>&1`
// to assert diagnostic capture in command substitutions.
// Adapted: shfs has no `$fish -c`, so we use a failing command directly.
test('fish expansion: expansion.fish - command substitution captures diagnostics with 2>&1', async () => {
	const withoutMerge = await runWithStatus('echo (find /missing)');
	expect(withoutMerge.output).toBe('');
	expect(withoutMerge.stderr).toContain('No such file or directory');

	const withMerge = await runWithStatus('echo (find /missing 2>&1)');
	expect(withMerge.output).toContain('No such file or directory');
	expect(withMerge.stderr).toBe('');
});

// expansion.fish lines 327 and 333 use `($fish -c '...' 2>&1)` patterns.
// Adapted: ensure compile diagnostics can be merged into captured substitution text.
test('fish expansion: expansion.fish - 2>&1 inside command substitution preserves diagnostic text', async () => {
	const merged = await runWithStatus('echo (grep -e 2>&1)');
	expect(merged.output).toContain('Option -e requires a value');
	expect(merged.stderr).toBe('');
});
