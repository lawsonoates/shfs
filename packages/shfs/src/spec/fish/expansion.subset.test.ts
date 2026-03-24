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

// expansion.fish: echo {apple,orange}
// Brace expansion is out of scope for shfs.

// expansion.fish: set -l foo; expansion "$foo"; expansion $foo
// Tests empty variable expansion behavior.
test('expansion subset: double-quoted empty variable expands to empty string', async () => {
	expect(await run('set -l foo; echo "$foo"')).toBe('');
});

test('expansion subset: unquoted empty variable expands to empty string', async () => {
	expect(await run('set -l foo; echo $foo')).toBe('');
});

// expansion.fish: set -l foo; expansion "prefix$foo"; expansion prefix$foo
test('expansion subset: double-quoted prefix with empty variable keeps prefix', async () => {
	expect(await run('set -l foo; echo "prefix$foo"')).toBe('prefix');
});

test('expansion subset: unquoted prefix with empty variable keeps prefix', async () => {
	expect(await run('set -l foo; echo prefix$foo')).toBe('prefix');
});

// expansion.fish: set -l foo ''; expansion "$foo"; expansion $foo
test('expansion subset: double-quoted variable set to empty string expands to empty', async () => {
	expect(await run('set -l foo \'\'; echo "$foo"')).toBe('');
});

test('expansion subset: unquoted variable set to empty string expands to empty', async () => {
	expect(await run("set -l foo ''; echo $foo")).toBe('');
});

// expansion.fish: set -l foo ''; expansion "prefix$foo"; expansion prefix$foo
test('expansion subset: prefix with variable set to empty string keeps prefix', async () => {
	expect(await run('set -l foo \'\'; echo "prefix$foo"')).toBe('prefix');
});

// expansion.fish: set -l foo bar; set -l bar baz; expansion "$$foo"
// Indirect expansion ($$) is out of scope for shfs.

// Variable expansion with command substitution.
test('expansion subset: variable expansion inside command substitution', async () => {
	await run('set -g name world');
	expect(await run('echo (echo $name)')).toBe('world');
});

// Variable expansion concatenated with literal text.
test('expansion subset: variable expansion concatenated with suffix', async () => {
	await run('set -g base file');
	expect(await run('echo $base.txt')).toBe('file.txt');
});

test('expansion subset: variable expansion in double quotes with surrounding text', async () => {
	await run('set -g greeting hello');
	expect(await run('echo "say $greeting please"')).toBe('say hello please');
});

// Variable set via command substitution, then expanded.
test('expansion subset: variable assigned from command substitution expands correctly', async () => {
	expect(await run('set -l val (echo dynamic); echo "result: $val"')).toBe(
		'result: dynamic'
	);
});

// Multiple variables in one expansion.
test('expansion subset: multiple variable expansions in one string', async () => {
	await run('set -g first hello');
	await run('set -g second world');
	expect(await run('echo "$first $second"')).toBe('hello world');
});

// Variable expansion with adjacent command substitution.
test('expansion subset: variable expansion adjacent to command substitution', async () => {
	await run('set -g prefix pre');
	expect(await run('echo "$prefix"(echo fix)')).toBe('prefix');
});

// Undefined variable expands to empty.
test('expansion subset: undefined variable expands to empty in double quotes', async () => {
	expect(await run('echo "value:$undefined"')).toBe('value:');
});

test('expansion subset: undefined variable expands to empty unquoted', async () => {
	expect(await run('echo value:$undefined')).toBe('value:');
});
