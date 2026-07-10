// Translated/adapted from fish-shell tests/checks/function-definition.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/function-definition.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream primarily checks the `functions` builtin's reconstruction of
// definitions. SHFS does not implement that introspection yet, so this subset
// checks the same argument declarations and body parsing through invocation.

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

// function-definition.fish: function stuff --argument a b c
test('fish function definition: function-definition.fish - --argument-names binds positional arguments', async () => {
	const script = [
		'function pair --argument-names a b',
		'    echo $a:$b',
		'end',
		'pair x y z',
	].join('\n');
	expect(await run(script)).toBe('x:y');
});

test('fish function definition: function-definition.fish - -a names beyond the arguments are empty', async () => {
	const script = [
		'function pair -a a b',
		'    echo (count $b) $a',
		'end',
		'pair x',
	].join('\n');
	expect(await run(script)).toBe('0 x');
});

// function-definition.fish: comments inside function bodies are allowed.
test('fish function definition: function-definition.fish - bodies may contain comments and blank lines', async () => {
	const script = [
		'function commenting',
		'',
		'    # line 2',
		'',
		'    echo Bye bye says line 6',
		'end',
		'commenting',
	].join('\n');
	expect(await run(script)).toBe('Bye bye says line 6');
});
