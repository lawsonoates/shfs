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

// set.fish:569-580: -a appends values in order.
test('fish set: set.fish - set -a appends values', async () => {
	const script = [
		'set -g var3a a b c',
		'set -a var3a',
		'set -a var3a d',
		'set -a var3a e f',
		'echo (count $var3a) $var3a',
	].join('\n');
	expect(await run(script)).toBe('6 a b c d e f');
});

// set.fish:591-603: -p prepends values in order.
test('fish set: set.fish - set -p prepends values', async () => {
	const script = [
		'set -g var4a a b c',
		'set -p var4a',
		'set -p var4a d',
		'set -p var4a e f',
		'echo (count $var4a) $var4a',
	].join('\n');
	expect(await run(script)).toBe('6 e f d a b c');
});

// set.fish:614-626: -a and -p together prepend and append the same values.
test('fish set: set.fish - set -a -p applies both directions', async () => {
	const script = [
		'set -g var5 abc def',
		'set -a -p var5 0 x 0',
		'echo (count $var5) $var5',
	].join('\n');
	expect(await run(script)).toBe('8 0 x 0 abc def 0 x 0');
});

// set.fish:641-652: append/prepend cannot target a slice.
test('fish set: set.fish - set -a on a slice is an error', async () => {
	for (const command of ['set -a foo[1]', 'set -p foo[1]']) {
		const result = await runResult(command);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			'set: Cannot use --append or --prepend when assigning to a slice'
		);
	}
});

// set.fish:654-666: set -l with append copies the closest scope.
test('fish set: set.fish - set -l -a copies the closest scope into the local', async () => {
	const script = [
		'set -g var6 ghi jkl',
		'begin',
		'    set -l -a var6 mno',
		'    echo $var6',
		'end',
		'echo $var6',
	].join('\n');
	expect(await run(script)).toBe('ghi jkl mno\nghi jkl');
});

// set.fish:668-694: `and`/`or` create no scope of their own; `begin` does.
test('fish set: set.fish - and/or create no scope but begin does', async () => {
	expect(
		await run('true; and set -l var7a 89 179\nset -q var7a\necho $status')
	).toBe('0');
	expect(
		await run(
			'true; and begin\n    set -l var7b 359 719\nend\nset -q var7b\necho $status'
		)
	).toBe('1');
	expect(
		await run('false; or set -l var8a 1439\nset -q var8a\necho $status')
	).toBe('0');
});

// set.fish:741-743: $status cannot be assigned.
test('fish set: set.fish - status is read-only', async () => {
	const result = await runResult('set -g status 5');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"set: Tried to change the read-only variable 'status'"
	);
});

// set.fish:774-790: erase reports missing names in $status and can erase
// indexes across several variables in one call.
test('fish set: set.fish - erase counts missing names and erases indexes', async () => {
	const script = [
		'set foo foo',
		'set bar bar',
		'set -e foo baz bar',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('4');

	const indexScript = [
		'set foo 1 2 3',
		'set bar 1 2 3',
		'set -e foo[1] bar[2]',
		'echo $foo',
		'echo $bar',
	].join('\n');
	expect(await run(indexScript)).toBe('2 3\n1 3');
});

// set.fish:800-805: the empty string is not a valid variable name.
test('fish set: set.fish - empty variable name is an error', async () => {
	const result = await runResult('set "" foo');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('set: invalid variable name');
});

// set.fish:1015-1018: index assignment requires matching value counts.
test('fish set: set.fish - index count must match value count', async () => {
	const script = ['set foo 1 2 3', 'set foo[1 2 3] a b'].join('\n');
	const result = await runResult(script);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		'set: The number of variable indexes does not match the number of values'
	);
});

// set.fish:1056-1062: assigning to index 0 is an error, not a crash.
test('fish set: set.fish - assigning index zero is an error', async () => {
	const result = await runResult('set line[0] ""');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('array indices start at 1');
});

// set.fish:994-1006: invalid slices are diagnosed even when the variable is
// undefined; syntactically valid open slices remain accepted.
test('fish set: set.fish - erase validates indexes on undefined variables', async () => {
	for (const command of [
		'set -e undefined[x..]',
		'set -e undefined[..y]',
	]) {
		const result = await runResult(command);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('Invalid index value');
	}

	for (const command of [
		'set -e undefined[1..]',
		'set -e undefined[..]',
		'set -e undefined[..1]',
	]) {
		const result = await runResult(command);
		expect(result.stderr).toBe('');
	}
});
