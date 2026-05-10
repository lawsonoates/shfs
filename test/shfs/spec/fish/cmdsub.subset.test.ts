// Translated/adapted from fish-shell tests/checks/cmdsub.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/cmdsub.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish uses $() for command substitution inside double quotes.
// shfs only supports bare () for command substitution (outside quotes).
// Inside double quotes, bare () must be treated as literal characters,
// matching fish semantics where bare () is literal inside double quotes.
// Tests using $() in fish are translated to the equivalent shfs pattern
// of closing and reopening double quotes around the substitution.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { Shell } from '#shfs/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// cmdsub.fish: echo "a$(echo b)c"
// Adapted: break out of double quotes for the substitution.
test('fish command substitution: cmdsub.fish - command substitution concatenated with double-quoted segments', async () => {
	expect(await run('echo "a"(echo b)"c"')).toBe('abc');
});

// cmdsub.fish: echo "$(echo "$(echo a)")"
// Adapted: nested substitution, unquoted.
test('fish command substitution: cmdsub.fish - nested command substitution', async () => {
	expect(await run('echo (echo (echo a))')).toBe('a');
});

// cmdsub.fish: echo "$(echo multiple).$(echo command).$(echo substitutions)"
// Adapted: break out of double quotes for each substitution.
test('fish command substitution: cmdsub.fish - multiple command substitutions joined by quoted literals', async () => {
	expect(
		await run(
			'echo (echo multiple)"."(echo command)"."(echo substitutions)'
		)
	).toBe('multiple.command.substitutions');
});

// cmdsub.fish: echo "$(echo 1))"
// Adapted: substitution followed by quoted literal ")".
test('fish command substitution: cmdsub.fish - substitution adjacent to quoted trailing paren', async () => {
	expect(await run('echo (echo 1)")"')).toBe('1)');
});

// cmdsub.fish: echo "($(echo 1))"
// In fish, the outer parens are literal inside double quotes.
// Adapted: quoted "(" + substitution + quoted ")".
test('fish command substitution: cmdsub.fish - quoted literal parens surrounding a substitution', async () => {
	expect(await run('echo "("(echo 1)")"')).toBe('(1)');
});

// cmdsub.fish: echo "$(echo 1) ( $(echo 2)"
// Adapted: substitution + quoted literal " ( " + substitution.
test('fish command substitution: cmdsub.fish - literal paren between substitutions', async () => {
	expect(await run('echo (echo 1)" ( "(echo 2)')).toBe('1 ( 2');
});

// cmdsub.fish: echo "$(echo A)B$(echo C)D"(echo E)
// Adapted: mix of quoted segments, unquoted substitutions.
test('fish command substitution: cmdsub.fish - mixed quoted and unquoted segments with substitutions', async () => {
	expect(await run('echo (echo A)"B"(echo C)"D"(echo E)')).toBe('ABCDE');
});

// cmdsub.fish: echo "($(echo A)B$(echo C))"
// Adapted: quoted parens wrapping substitutions and quoted literal.
test('fish command substitution: cmdsub.fish - quoted literal parens wrapping substitutions and text', async () => {
	expect(await run('echo "("(echo A)"B"(echo C)")"')).toBe('(ABC)');
});

// cmdsub.fish: echo "quoted1""quoted2"(echo unquoted3)"$(echo quoted4)_$(echo quoted5)"
// Adapted: adjacent quoted and unquoted segments.
test('fish command substitution: cmdsub.fish - adjacent quoted segments and unquoted substitutions', async () => {
	expect(
		await run(
			'echo "quoted1""quoted2"(echo unquoted3)(echo quoted4)"_"(echo quoted5)'
		)
	).toBe('quoted1quoted2unquoted3quoted4_quoted5');
});

// cmdsub.fish: var=a echo "$var$(echo b)"
// Adapted: variable expansion concatenated with substitution output.
test('fish command substitution: cmdsub.fish - variable expansion adjacent to command substitution', async () => {
	await run('set -g var a');
	expect(await run('echo "$var"(echo b)')).toBe('ab');
});

// cmdsub.fish: echo \$(echo 1)
// Escaped $ is literal, then (echo 1) is command substitution.
test('fish command substitution: cmdsub.fish - escaped dollar is literal before command substitution', async () => {
	expect(await run('echo \\$(echo 1)')).toBe('$1');
});

// Core bug scenario: bare parentheses inside double quotes must be literal.
// In fish, () inside double quotes is NOT command substitution.
// This matches fish behavior and catches the original parsing bug where
// echo "console.log('test')" > file caused "test requires operands".

test('fish command substitution: cmdsub.fish - bare parentheses inside double quotes are literal', async () => {
	expect(await run('echo "hello(world)"')).toBe('hello(world)');
});

test('fish command substitution: cmdsub.fish - function-call-like syntax inside double quotes is literal', async () => {
	expect(await run('echo "console.log(\'test\')"')).toBe(
		"console.log('test')"
	);
});

test('fish command substitution: cmdsub.fish - nested parens inside double quotes are literal', async () => {
	expect(await run('echo "fn(a, b(c))"')).toBe('fn(a, b(c))');
});

test('fish command substitution: cmdsub.fish - empty parens inside double quotes are literal', async () => {
	expect(await run('echo "init()"')).toBe('init()');
});

// cmdsub.fish: parentheses inside single quotes are always literal.
test('fish command substitution: cmdsub.fish - parentheses inside single quotes are literal', async () => {
	expect(await run("echo 'hello(world)'")).toBe('hello(world)');
});

// Basic unquoted command substitution.
test('fish command substitution: cmdsub.fish - basic unquoted command substitution', async () => {
	expect(await run('echo (echo hello)')).toBe('hello');
});

// Deeply nested command substitution.
test('fish command substitution: cmdsub.fish - deeply nested command substitution', async () => {
	expect(await run('echo (echo (echo (echo deep)))')).toBe('deep');
});

// Command substitution as argument to another command.
test('fish command substitution: cmdsub.fish - command substitution as set value', async () => {
	expect(await run('set -g result (echo computed); echo $result')).toBe(
		'computed'
	);
});
