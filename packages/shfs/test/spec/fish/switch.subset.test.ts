// Translated/adapted from fish-shell tests/checks/switch.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/switch.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: the upstream multi-value case uses three blank output lines. The shfs
// adaptation uses visible values because its command-substitution boundary
// trims trailing empty lines. The final upstream `doesnotexist` case depends
// on unknown-command propagation from command substitutions and remains out
// of this control-flow subset.

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

async function result(command: string) {
	const value = await shell.$`${command}`.nothrow();
	return {
		status: value.exitCode,
		stderr: value.stderr.toString(),
		stdout: value.text(),
	};
}

test('fish switch: switch.fish - an empty variable matches an empty case', async () => {
	const script = [
		'switch $missing',
		"    case ''",
		'        echo very little',
		"    case '*'",
		'        echo Nothin',
		"    case ''",
		'        echo banana',
		'end',
	].join('\n');

	expect(await run(script)).toBe('very little');
});

test('fish switch: switch.fish - empty command substitutions match an empty case', async () => {
	const trueScript = [
		'switch (true)',
		"    case ''",
		'        echo true-empty',
		'end',
	].join('\n');
	const echoScript = [
		'switch (echo)',
		"    case ''",
		'        echo echo-empty',
		'end',
	].join('\n');

	expect(await run(trueScript)).toBe('true-empty');
	expect(await run(echoScript)).toBe('echo-empty');
});

test('fish switch: switch.fish - a value expanding to multiple arguments is rejected', async () => {
	const value = await result(
		'switch (echo a; echo b; echo c)\n    case a\n        echo nope\nend'
	);

	expect(value.status).not.toBe(0);
	expect(value.stderr).toContain('switch');
	expect(value.stderr).toContain('3');
	expect(value.stdout).toBe('');
});

test('fish switch: switch.fish - a missing switch value is rejected', async () => {
	const value = await result("switch\n    case ''\n        echo nope\nend");

	expect(value.status).not.toBe(0);
	expect(value.stderr).toContain('switch');
	expect(value.stderr).toContain('value');
	expect(value.stdout).toBe('');
});

test('fish switch: switch.fish - a quoted wildcard pattern matches the value', async () => {
	const script = [
		'set smurf green',
		'switch $smurf',
		'    case "*ee*"',
		'        echo pass',
		'    case "*"',
		'        echo fail',
		'end',
	].join('\n');

	expect(await run(script)).toBe('pass');
});

test('fish switch: switch.fish - an unquoted glob error does not prevent later cases', async () => {
	const script = [
		'set smurf green',
		'switch $smurf',
		'    case *ee*',
		'        echo fail',
		'    case red green blue',
		'        echo pass',
		'    case "*"',
		'        echo fail',
		'end',
	].join('\n');
	const value = await result(script);

	expect(value.status).toBe(0);
	expect(value.stderr).toContain('error[expansion:no-match]');
	expect(value.stderr).toContain('*ee*');
	expect(value.stdout).toBe('pass');
});

test('fish switch: switch.fish - the wildcard fallback runs when exact cases do not match', async () => {
	const script = [
		'set smurf green',
		'switch $smurf',
		'    case cyan magenta yellow',
		'        echo fail',
		'    case "*"',
		'        echo pass',
		'end',
	].join('\n');

	expect(await run(script)).toBe('pass');
});
