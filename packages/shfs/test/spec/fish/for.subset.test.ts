// Translated/adapted from fish-shell tests/checks/for.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/for.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream cases built on `set -q -l`, `--on-variable` event handlers,
// and `set --show` are out of scope; the scoping behavior they observe is
// asserted here with plain echo checks instead.

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

// Basic iteration order.
test('fish for: for.fish - iterates values in order', async () => {
	expect(await run('for i in 1 2 3\n    echo $i\nend')).toBe('1\n2\n3');
});

// for.fish: a for-loop variable is a local variable in the enclosing scope.
test('fish for: for.fish - loop variable stays visible after the loop', async () => {
	expect(await run('for i in local\nend\necho $i')).toBe('local');
});

// for.fish: the loop variable is initialized with any previous value.
test('fish for: for.fish - empty value list keeps the previous value', async () => {
	expect(await run('set -g j global\nfor j in\nend\necho $j')).toBe('global');
});

// for.fish: loop variables exist only locally in the enclosing local scope.
test('fish for: for.fish - loop variables scope to the enclosing block', async () => {
	const script = [
		'set -g k global',
		'begin',
		'    for k in local1',
		'        echo $k',
		'        for k in local2',
		'        end',
		'        echo $k',
		'    end',
		'    echo $k',
		'end',
		'echo $k',
	].join('\n');
	expect(await run(script)).toBe('local1\nlocal2\nlocal1\nglobal');
});

// for.fish: set -l in the loop body does not persist across iterations.
// Adapted: upstream seeds $foo via a prior loop; this port seeds it directly.
test('fish for: for.fish - body-local set resets on each iteration', async () => {
	const script = [
		'set -g foo 3',
		'for x in 1 2 3',
		'    test $x -eq 2; and set -l foo bar',
		'    echo foo value is $foo',
		'end',
	].join('\n');
	expect(await run(script)).toBe(
		'foo value is 3\nfoo value is bar\nfoo value is 3'
	);
});

// List variables feed for loops directly.
test('fish for: for.fish - iterates list variables and extra words', async () => {
	expect(
		await run('set -l vals a b\nfor v in $vals x\n    echo $v\nend')
	).toBe('a\nb\nx');
});
