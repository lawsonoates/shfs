// Translated/adapted from fish-shell tests/checks/expansion.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/expansion.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish expansion.fish covers brace expansion, tilde expansion, path
// variables, and indirect variable expansion ($$), which are out of scope.
// This subset covers list-variable expansion counts, empty-list elision,
// quoting behaviors, and cartesian products of adjacent expansions.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

// expansion.fish: function expansion --description 'Prints argument count
// followed by arguments'
const EXPANSION_FUNCTION = [
	'function expansion',
	'    echo (count $argv) $argv',
	'end',
].join('\n');

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

async function runExpansion(setup: string, call: string): Promise<string> {
	return await run(`${EXPANSION_FUNCTION}\n${setup}\n${call}`);
}

// expansion.fish: set -l foo; expansion "$foo" → 1
// (The output has a trailing space from echoing the empty argument;
// upstream's CHECK lines trim it.)
test('fish expansion: expansion.fish - quoted empty list expands to one empty argument', async () => {
	expect(await runExpansion('set -l foo', 'expansion "$foo"')).toBe('1 ');
});

// expansion.fish: set -l foo; expansion $foo → 0
test('fish expansion: expansion.fish - unquoted empty list expands to zero arguments', async () => {
	expect(await runExpansion('set -l foo', 'expansion $foo')).toBe('0');
});

// expansion.fish: set -l foo; expansion "prefix$foo" → 1 prefix
test('fish expansion: expansion.fish - quoted prefix with empty list keeps the prefix', async () => {
	expect(await runExpansion('set -l foo', 'expansion "prefix$foo"')).toBe(
		'1 prefix'
	);
});

// expansion.fish: set -l foo; expansion prefix$foo → 0
test('fish expansion: expansion.fish - unquoted prefix with empty list elides the word', async () => {
	expect(await runExpansion('set -l foo', 'expansion prefix$foo')).toBe('0');
});

// expansion.fish: set -l foo ''; expansion "$foo" / $foo → 1 / 1
test('fish expansion: expansion.fish - empty-string element expands to one empty argument', async () => {
	expect(await runExpansion("set -l foo ''", 'expansion "$foo"')).toBe('1 ');
	expect(await runExpansion("set -l foo ''", 'expansion $foo')).toBe('1 ');
});

// expansion.fish: set -l foo ''; expansion "prefix$foo" / prefix$foo → 1 prefix
test('fish expansion: expansion.fish - empty-string element keeps prefixed words', async () => {
	expect(await runExpansion("set -l foo ''", 'expansion "prefix$foo"')).toBe(
		'1 prefix'
	);
	expect(await runExpansion("set -l foo ''", 'expansion prefix$foo')).toBe(
		'1 prefix'
	);
});

// Undefined variables behave like empty lists.
test('fish expansion: expansion.fish - undefined variable in quotes is one empty argument', async () => {
	expect(await run(`${EXPANSION_FUNCTION}\nexpansion "$undefined"`)).toBe(
		'1 '
	);
	expect(await run('echo "value:$undefined"')).toBe('value:');
});

test('fish expansion: expansion.fish - undefined variable unquoted elides the word', async () => {
	expect(await run(`${EXPANSION_FUNCTION}\nexpansion value:$undefined`)).toBe(
		'0'
	);
});

// Multi-element expansion counts.
test('fish expansion: expansion.fish - unquoted list expands to one argument per element', async () => {
	expect(await runExpansion('set -l pair a b', 'expansion $pair')).toBe(
		'2 a b'
	);
});

// Quoted lists join with spaces.
test('fish expansion: expansion.fish - quoted list joins elements with spaces', async () => {
	expect(await runExpansion('set -l pair a b', 'expansion "$pair"')).toBe(
		'1 a b'
	);
});

// expansion.fish: echo {$aa}a{1,2,3}... (adapted: cartesian product via lists)
test('fish expansion: expansion.fish - adjacent list expansion forms a cartesian product', async () => {
	expect(await runExpansion('set -l pair a b', 'expansion x$pair')).toBe(
		'2 xa xb'
	);
	expect(
		await runExpansion('set -l l 1 2\nset -l r x y', 'expansion $l$r')
	).toBe('4 1x 1y 2x 2y');
});

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

// Single quotes suppress variable expansion.
test('fish expansion: expansion.fish - single quotes keep dollar literal', async () => {
	await run('set -g solo value');
	expect(await run("echo '$solo'")).toBe('$solo');
});

// expansion.fish: $f[a] → Invalid index value
test('fish expansion: expansion.fish - non-numeric index is an error', async () => {
	const result = await runWithStatus('echo $f[a]');
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('Invalid index value');
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
