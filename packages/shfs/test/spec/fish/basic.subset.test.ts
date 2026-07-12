// Translated/adapted from fish-shell tests/checks/basic.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/basic.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: basic.fish is a broad smoke test of fish syntax. This subset ports the
// if/else-if/else chains, begin blocks as conditions, lazy condition
// evaluation, and break/continue behavior. Upstream cases built on `switch`,
// `eval`, `contains`, dynamically-invoked loop controls, and process/job
// features are out of scope.

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

// basic.fish: if true; echo alpha1.1 ... else if/else chain takes first branch
test('fish basic: basic.fish - if takes the first true branch', async () => {
	const script = [
		'if true',
		'    echo alpha1.1',
		'    echo alpha1.2',
		'else if false',
		'    echo beta1.1',
		'else',
		'    echo delta1.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('alpha1.1\nalpha1.2');
});

// basic.fish: else if begin ; true ; end
test('fish basic: basic.fish - begin block works as else if condition', async () => {
	const script = [
		'if false',
		'    echo alpha2.1',
		'else if begin ; true ; end',
		'    echo beta2.1',
		'    echo beta2.2',
		'else if begin ; echo nope2.1; false ; end',
		'    echo gamma2.1',
		'else',
		'    echo delta2.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('beta2.1\nbeta2.2');
});

// basic.fish: conditions run their side effects until a branch is taken
test('fish basic: basic.fish - else if conditions evaluate lazily in order', async () => {
	const script = [
		'if false',
		'    echo alpha3.1',
		'else if begin ; echo yep3.1; false ; end',
		'    echo beta3.1',
		'else if begin ; echo yep3.2; true ; end',
		'    echo gamma3.1',
		'else',
		'    echo delta3.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('yep3.1\nyep3.2\ngamma3.1');
});

// basic.fish: all conditions false falls through to else
test('fish basic: basic.fish - else runs after all conditions fail', async () => {
	const script = [
		'if false',
		'    echo alpha4.1',
		'else if begin ; echo yep4.1; false ; end',
		'    echo beta4.1',
		'else if begin ; echo yep4.2; false ; end',
		'    echo gamma4.1',
		'else',
		'    echo delta4.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('yep4.1\nyep4.2\ndelta4.1');
});

// basic.fish: else if not_a_valid_command but it should be OK because a
// previous branch was taken
test('fish basic: basic.fish - untaken else if branch may reference unknown commands', async () => {
	const script = [
		'if test ! -n "abc"',
		'else if test -n "def"',
		'    echo "epsilon5.2"',
		'else if not_a_valid_command but it should be OK because a previous branch was taken',
		'    echo "epsilon 5.3"',
		'else if test ! -n "abc"',
		'    echo "epsilon 5.4"',
		'end',
	].join('\n');
	expect(await run(script)).toBe('epsilon5.2');
});

// basic.fish: if not echo skip1 > /dev/null ... else if echo skip2 > /dev/null
test('fish basic: basic.fish - not with redirected builtin in if condition', async () => {
	const script = [
		'if not echo skip1 > /dev/null',
		'    echo "zeta 6.1"',
		'else if echo skip2 > /dev/null',
		'    echo "zeta 6.2"',
		'end',
	].join('\n');
	expect(await run(script)).toBe('zeta 6.2');
});

// basic.fish: continue skips to the next loop iteration.
// Adapted: upstream filters with `contains`; test provides the same gate.
test('fish basic: basic.fish - continue skips non-matching iterations', async () => {
	const script = [
		'for i in a b c d',
		'    if not test $i = c ; continue ; end',
		'    echo $i',
		'end',
	].join('\n');
	expect(await run(script)).toBe('c');
});

// basic.fish: break exits the loop at the first match.
test('fish basic: basic.fish - break exits the loop early', async () => {
	const script = [
		'for i in a b c d',
		'    echo $i',
		'    if test $i = b ; break ; end',
		'end',
	].join('\n');
	expect(await run(script)).toBe('a\nb');
});

// basic.fish: break outside a loop is an error
test('fish basic: basic.fish - break outside of a loop reports an error', async () => {
	const result = await runResult('break');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('break: Not inside of loop');
});

// basic.fish: continue outside a loop is an error
test('fish basic: basic.fish - continue outside of a loop reports an error', async () => {
	const result = await runResult('continue');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('continue: Not inside of loop');
});
