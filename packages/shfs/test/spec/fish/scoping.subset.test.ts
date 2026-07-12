// Translated/adapted from fish-shell tests/checks/scoping.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/scoping.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Out of scope: universal (-U), exported (-x), and unexported (-u) scope
// variants (scoping.fish:65, 83-207), `set -n`, `set -h` documentation
// output, and invalid-option diagnostics (scoping.fish:230-251).

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

// scoping.fish:6-8,14-22,34-35: an unscoped set inside a callee creates its
// own function-scoped variable and does not touch the caller's local.
test('fish scoping: scoping.fish - callee set does not overwrite caller local', async () => {
	const script = [
		'function setter',
		'    set smurf green',
		'end',
		'function call1',
		'    set smurf blue',
		'    setter',
		'    echo $smurf',
		'end',
		'call1',
	].join('\n');
	expect(await run(script)).toBe('blue');
});

// scoping.fish:10-12,24-32,36-37: erasing inside a callee does not erase the
// caller's function-scoped variable.
test('fish scoping: scoping.fish - callee erase does not erase caller local', async () => {
	const script = [
		'function unsetter',
		'    set -e smurf',
		'end',
		'function call2',
		'    set smurf blue',
		'    unsetter',
		'    echo $smurf',
		'end',
		'call2',
	].join('\n');
	expect(await run(script)).toBe('blue');
});

// scoping.fish:39-46,57-59: with a global defined, an unscoped set inside a
// function updates the global.
test('fish scoping: scoping.fish - callee set updates an existing global', async () => {
	const script = [
		'function setter',
		'    set smurf green',
		'end',
		'set -g smurf yellow',
		'setter',
		'echo $smurf',
	].join('\n');
	expect(await run(script)).toBe('green');
});

// scoping.fish:48-55,60-61: erasing inside a function erases the global.
test('fish scoping: scoping.fish - callee erase erases an existing global', async () => {
	const script = [
		'function unsetter',
		'    set -e smurf',
		'end',
		'set -g smurf yellow',
		'unsetter',
		'set -q smurf',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('1');
});

// scoping.fish:63-74: scope-restricted query finds a local variable.
test('fish scoping: scoping.fish - set -l -q finds a local variable', async () => {
	expect(await run('set -l foo 1; set -l -q foo; echo $status')).toBe('0');
});

// scoping.fish:64,76-81: scope-restricted query finds a global variable.
test('fish scoping: scoping.fish - set -g -q finds a global variable', async () => {
	expect(await run('set -g bar 2; set -g -q bar; echo $status')).toBe('0');
});

// scoping.fish:209-211: each command substitution updates $status in order
// within one command line.
test('fish scoping: scoping.fish - subcommand statuses update between substitutions', async () => {
	expect(
		await run('echo (false) $status (true) $status (false) $status')
	).toBe('1 0 1');
});

// scoping.fish:213-221: plain `set name value` passes the previous $status
// through.
test('fish scoping: scoping.fish - set passes through the previous status', async () => {
	expect(await run('false; set foo bar; echo $status')).toBe('1');
	expect(await run('true; set foo bar; echo $status')).toBe('0');
});

// scoping.fish:222-229: query mode sets its own status instead.
test('fish scoping: scoping.fish - set -q sets its own status', async () => {
	expect(await run('false; set -g foo 1; set -q foo; echo $status')).toBe(
		'0'
	);
});

// scoping.fish:234-241: erase mode sets its own status; erasing a missing
// variable fails with status 4.
test('fish scoping: scoping.fish - set -e sets its own status', async () => {
	expect(await run('false; set -g foo 1; set -e foo; echo $status')).toBe(
		'0'
	);
	expect(await run('true; set -e missing_variable; echo $status')).toBe('4');
});

// scoping.fish:252-259: assignment from a substitution passes the
// substitution's status through while storing its output.
test('fish scoping: scoping.fish - set from substitution passes substitution status', async () => {
	expect(await run('false; set foo (echo A; true); echo $status $foo')).toBe(
		'0 A'
	);
	expect(await run('true; set foo (echo B; false); echo $status $foo')).toBe(
		'1 B'
	);
});

// scoping.fish:262-270: combined short flags -ql query the local scope.
test('fish scoping: scoping.fish - set -ql queries function locals', async () => {
	const script = [
		'function setql_check',
		'    set -l setql_foo val',
		'    if set -ql setql_foo',
		'        echo Pass',
		'    else',
		'        echo Fail',
		'    end',
		'end',
		'setql_check',
	].join('\n');
	expect(await run(script)).toBe('Pass');
});
