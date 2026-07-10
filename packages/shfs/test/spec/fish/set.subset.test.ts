// Translated/adapted from fish-shell tests/checks/set.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/set.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: universal variables (-U), exported variables (-x/-u), variable events,
// and `set --show` output are out of scope. Scoping, erasing, querying,
// list values, and index erasure are covered.

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

// set.fish Test 1: set smurf blue; if test $smurf = blue
test('fish set: set.fish - default scope assignment is readable in the same script', async () => {
	const script = [
		'set smurf blue',
		'if test $smurf = blue',
		'    echo Test 1 pass',
		'else',
		'    echo Test 1 fail',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 1 pass');
});

// set.fish Test 2: set -e smurf; set -q smurf
test('fish set: set.fish - erased variables are no longer queryable', async () => {
	const script = [
		'set smurf blue',
		'set -e smurf',
		'if set -q smurf',
		'    echo Test 2 fail',
		'else',
		'    echo Test 2 pass',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 2 pass');
});

// set.fish Test 3: local variables go out of scope with their block
test('fish set: set.fish - block-local variables go out of scope', async () => {
	const script = [
		'if true',
		'    set -l t3 bar',
		'end',
		'if set -q t3',
		'    echo Test 3 fail',
		'else',
		'    echo Test 3 pass',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 3 pass');
});

// set.fish Test 4: globals can be set in block scope
test('fish set: set.fish - globals can be set inside blocks', async () => {
	const script = [
		'if true',
		'    set -g baz qux',
		'end',
		'if test $baz = qux',
		'    echo Test 4 pass',
		'else',
		'    echo Test 4 fail',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 4 pass');
});

// set.fish Test 5: scope is preserved when setting a new value
test('fish set: set.fish - existing scope is preserved on reassignment', async () => {
	const script = [
		'set t5 a',
		'if true',
		'    set t5 b',
		'end',
		'if test $t5 = b',
		'    echo Test 5 pass',
		'else',
		'    echo Test 5 fail',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 5 pass');
});

// set.fish Test 6: scope is preserved in double blocks
test('fish set: set.fish - scope is preserved in nested loops', async () => {
	const script = [
		'for i in 1',
		'    set t6 $i',
		'    for j in a',
		'        if test $t6$j = 1a',
		'            echo Test 6 pass',
		'        else',
		'            echo Test 6 fail',
		'        end',
		'    end',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 6 pass');
});

// set.fish Test 7: variables in for loop blocks do not go out of scope on new laps
test('fish set: set.fish - loop body variables persist across iterations', async () => {
	const script = [
		'set res fail',
		'for i in 1 2',
		'    if test $i = 1',
		'        set t7 lala',
		'    else',
		'        if test -n "$t7"',
		'            set res pass',
		'        end',
		'    end',
		'end',
		'echo Test 7 $res',
	].join('\n');
	expect(await run(script)).toBe('Test 7 pass');
});

// set.fish test16: the caller's local variables are not visible inside a
// function, but globals are.
test('fish set: set.fish - functions see globals but not caller locals', async () => {
	const script = [
		'set -g gseen global',
		'set -l lhidden caller',
		'function peek',
		'    echo "[$gseen][$lhidden]"',
		'end',
		'peek',
	].join('\n');
	expect(await run(script)).toBe('[global][]');
});

// set.fish Test 10 (adapted, no universal scope): erase in a specific scope
test('fish set: set.fish - erasing the global while a local shadows it', async () => {
	const script = [
		'set -g dual bar',
		'begin',
		'    set -l dual baz',
		'    set -eg dual',
		'end',
		'if set -q dual',
		'    echo Test 10 fail',
		'else',
		'    echo Test 10 pass',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 10 pass');
});

// set.fish Test 11: set -e var[1]
test('fish set: set.fish - erasing a single index shrinks the list', async () => {
	const script = [
		'set duo abc def',
		'set -e duo[1]',
		"if test $duo '=' def",
		'    echo Test 11 pass',
		'else',
		'    echo Test 11 fail',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Test 11 pass');
});

// set.fish test16res pattern: append by self-reference
test('fish set: set.fish - lists append by self-reference', async () => {
	const script = [
		'set acc one',
		'set acc $acc two',
		'set acc $acc three',
		'echo (count $acc) $acc',
	].join('\n');
	expect(await run(script)).toBe('3 one two three');
});

// Multiple values form a list; echo joins with spaces.
test('fish set: set.fish - multiple values form a list', async () => {
	expect(await run('set -g pair abc def; echo $pair')).toBe('abc def');
	expect(await run('count $pair')).toBe('2');
	expect(await run('echo $pair[2]')).toBe('def');
});

// set -q returns the number of unset variable names.
test('fish set: set.fish - set -q status counts missing variables', async () => {
	const result = await runResult('set -q definitely_not_set_xyz');
	expect(result.exitCode).toBe(1);
	expect(await run('set -g present 1; set -q present; echo $status')).toBe(
		'0'
	);
});

// set.fish Test 18: set accepts command substitutions and participates in
// boolean chaining based on the substitution status.
test('fish set: set.fish - command substitution can be used as set value', async () => {
	expect(
		await run('set -g fish_test_18 (echo pass); echo $fish_test_18')
	).toBe('pass');
});

test('fish set: set.fish - set success participates in status/boolean chaining', async () => {
	expect(await run('set -g chain_ok yes; and echo pass; or echo fail')).toBe(
		'pass'
	);
	expect(await run('echo $status')).toBe('0');
});

test('fish set: set.fish - validates variable names', async () => {
	const result = await runResult('set -g 1bad value');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('set: invalid variable name: 1bad');
});
