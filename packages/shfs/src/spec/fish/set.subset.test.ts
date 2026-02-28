// Translated/adapted from fish-shell tests/checks/set.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/set.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

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

test('set subset: can assign and read global variables', async () => {
	await run('set -g smurf blue');
	expect(await run('echo $smurf')).toBe('blue');
});

test('set subset: local variables are scoped to one script run', async () => {
	expect(await run('set -l t3 bar; echo $t3')).toBe('bar');
	expect(await run('echo $t3')).toBe('');
});

test('set subset: global reassignment persists across runs', async () => {
	await run('set -g t5 a');
	await run('set -g t5 b');
	expect(await run('echo $t5')).toBe('b');
});

test('set subset: local scope shadows global scope within a run', async () => {
	await run('set -g shade blue');
	expect(await run('set -l shade red; echo $shade')).toBe('red');
	expect(await run('echo $shade')).toBe('blue');
});

test('set subset: command substitution can be used as set value', async () => {
	expect(
		await run('set -g fish_test_18 (echo pass); echo $fish_test_18')
	).toBe('pass');
});

test('set subset: multiple values are preserved as a space-joined value', async () => {
	expect(
		await run(
			'set -g __fish_test_universal_variables_variable_foo abc def; echo $__fish_test_universal_variables_variable_foo'
		)
	).toBe('abc def');
});

test('set subset: set success participates in status/boolean chaining', async () => {
	expect(await run('set -g chain_ok yes; and echo pass; or echo fail')).toBe(
		'pass'
	);
	expect(await run('echo $status')).toBe('0');
});

test('set subset: requires exactly one scope flag', async () => {
	await expect(run('set no_scope value')).rejects.toThrow(
		'set requires exactly one scope flag: -g or -l'
	);
	await expect(run('set -g -l mixed value')).rejects.toThrow(
		'set requires exactly one scope flag: -g or -l'
	);
});

test('set subset: validates variable names', async () => {
	await expect(run('set -g 1bad value')).rejects.toThrow(
		'set: invalid variable name: 1bad'
	);
});

test('set subset: erase/export/universal/query flags are out of scope', async () => {
	await expect(run('set -e smurf')).rejects.toThrow('Unknown flag: -e');
	await expect(run('set -x smurf blue')).rejects.toThrow('Unknown flag: -x');
	await expect(run('set -U smurf blue')).rejects.toThrow('Unknown flag: -U');
	await expect(run('set -u smurf blue')).rejects.toThrow('Unknown flag: -u');
	await expect(run('set -q smurf')).rejects.toThrow('Unknown flag: -q');
});

test('set subset: control-flow-driven set usage is out of scope', async () => {
	await expect(run('if test 1 = 1; set -g scoped yes; end')).rejects.toThrow(
		'Unknown command: if'
	);
	await expect(run('for i in 1; set -g scoped yes; end')).rejects.toThrow(
		'Unknown command: for'
	);
	await expect(run('function f; set -g scoped yes; end')).rejects.toThrow(
		'Unknown command: function'
	);
});
