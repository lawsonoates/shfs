// Translated/adapted from fish-shell tests/checks/function.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/function.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream largely tests `functions` introspection (listing, copying,
// autoloading, events, -V captures), which is out of scope. This subset covers
// definitions, invocation, $argv, function-local scoping, and reserved-name
// validation.

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

// Basic definition and invocation.
test('fish function: function.fish - defines and invokes a function', async () => {
	expect(await run('function greet\n    echo hello\nend\ngreet')).toBe(
		'hello'
	);
});

// $argv carries the call arguments.
test('fish function: function.fish - $argv holds the arguments', async () => {
	const script = [
		'function args',
		'    echo (count $argv) $argv',
		'end',
		'args a b c',
	].join('\n');
	expect(await run(script)).toBe('3 a b c');
});

// Function-local variables are invisible to the caller.
test('fish function: function.fish - set -l inside a function stays local', async () => {
	const script = [
		'function f',
		'    set -l inner xyz',
		'end',
		'f',
		'echo "[$inner]"',
	].join('\n');
	expect(await run(script)).toBe('[]');
});

// Default set scope inside a function is function-local.
test('fish function: function.fish - plain set inside a function stays local', async () => {
	const script = [
		'function f',
		'    set fvar abc',
		'end',
		'f',
		'echo "[$fvar]"',
	].join('\n');
	expect(await run(script)).toBe('[]');
});

// set -g inside a function is visible outside.
test('fish function: function.fish - set -g inside a function is global', async () => {
	const script = [
		'function f',
		'    set -g gvar abc',
		'end',
		'f',
		'echo $gvar',
	].join('\n');
	expect(await run(script)).toBe('abc');
});

// function.fish: function test → reserved keyword error
test('fish function: function.fish - reserved keywords cannot be function names', async () => {
	const result = await runResult('function test\n    echo banana\nend');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		'function: test: cannot use reserved keyword as function name'
	);
});

// Redefinition replaces the previous body.
test('fish function: function.fish - redefinition replaces the function', async () => {
	const script = [
		'function f',
		'    echo first',
		'end',
		'function f',
		'    echo second',
		'end',
		'f',
	].join('\n');
	expect(await run(script)).toBe('second');
});

// function.fish:200-205: --argument-names may rebind argv.
test('fish function: function.fish - a named argument called argv overrides the argument list', async () => {
	const script = [
		'function t --argument-names a argv c',
		'    echo $argv',
		'end',
		't 1 2 3',
	].join('\n');
	expect(await run(script)).toBe('2');
});

// function.fish:207-211: -a argv binds the first argument only.
test('fish function: function.fish - -a argv binds the first argument', async () => {
	const script = [
		'function t -a argv',
		'    echo $argv',
		'end',
		't 1 2 3',
	].join('\n');
	expect(await run(script)).toBe('1');
});

// function.fish:160-163: --argument-names status is rejected as read-only.
test('fish function: function.fish - -a status is a read-only variable error', async () => {
	const result = await runResult('function foo --argument-names status\nend');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("function: variable 'status' is read-only");
});

// function.fish:61-65: the function name must come before options.
test('fish function: function.fish - an option in name position is an invalid function name', async () => {
	const result = await runResult('function -a arg1 arg2 name2\nend');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('function: -a: invalid function name');
});

// function.fish:75-79: positional arguments after the name are rejected.
test('fish function: function.fish - stray positional argument is an error', async () => {
	const result = await runResult(
		'function name5 abc --argument-names def\nend'
	);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		'function: abc: unexpected positional argument'
	);
});

// function.fish:182-186: a function redefined inside its own argument list is
// resolved after the arguments are expanded (codified historic behavior).
test('fish function: function.fish - redefinition in its own arguments is visible to the call', async () => {
	const script = [
		'function foo',
		'    echo before',
		'end',
		'foo (function foo',
		'    echo after',
		'end)',
	].join('\n');
	expect(await run(script)).toBe('after');
});

// Functions can call other functions.
test('fish function: function.fish - functions can call functions', async () => {
	const script = [
		'function inner',
		'    echo inner $argv',
		'end',
		'function outer',
		'    inner from outer',
		'end',
		'outer',
	].join('\n');
	expect(await run(script)).toBe('inner from outer');
});
