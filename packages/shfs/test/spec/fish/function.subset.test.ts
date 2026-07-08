// Translated/adapted from fish-shell tests/checks/function.fish and
// tests/checks/function-definition.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/function.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream largely tests `functions` introspection (listing, copying,
// autoloading, events, -V captures), which is out of scope. This subset covers
// definitions, invocation, $argv, --argument-names, function-local scoping,
// and reserved-name validation.

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

// function-definition.fish: function stuff --argument a b c
test('fish function: function-definition.fish - --argument-names binds positional arguments', async () => {
	const script = [
		'function pair --argument-names a b',
		'    echo $a:$b',
		'end',
		'pair x y z',
	].join('\n');
	expect(await run(script)).toBe('x:y');
});

test('fish function: function-definition.fish - -a names beyond the arguments are empty', async () => {
	const script = [
		'function pair -a a b',
		'    echo (count $b) $a',
		'end',
		'pair x',
	].join('\n');
	expect(await run(script)).toBe('0 x');
});

// function-definition.fish: comments inside function bodies are allowed.
test('fish function: function-definition.fish - bodies may contain comments and blank lines', async () => {
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

// set.fish test16: the caller's local variables are not visible inside a
// function, but globals are.
test('fish function: function.fish - functions see globals but not caller locals', async () => {
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

// Functions persist across separate shell invocations.
test('fish function: function.fish - functions persist across script runs', async () => {
	await run('function keeper\n    echo kept\nend');
	expect(await run('keeper')).toBe('kept');
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
