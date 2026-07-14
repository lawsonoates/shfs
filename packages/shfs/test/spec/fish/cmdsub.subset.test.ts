// Translated/adapted from fish-shell tests/checks/cmdsub.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/cmdsub.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: shfs supports both bare () and $() command substitution, including
// $() inside double quotes. Bare () inside double quotes stays literal,
// matching fish semantics. Upstream's escape sequences (\n) and brace
// expansion cases are adapted with functions that emit multiple lines.

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

// ── $() form ────────────────────────────────────────────────

// cmdsub.fish: echo $(echo 1\n2)
// Adapted: a function emits the two lines instead of echo with \n escapes.
test('fish command substitution: cmdsub.fish - unquoted $() splits output lines into arguments', async () => {
	const script = [
		'function two',
		'    echo 1',
		'    echo 2',
		'end',
		'echo $(two)',
	].join('\n');
	expect(await run(script)).toBe('1 2');
});

// cmdsub.fish: echo "a$(echo b)c"
test('fish command substitution: cmdsub.fish - $() works inside double quotes', async () => {
	expect(await run('echo "a$(echo b)c"')).toBe('abc');
});

// cmdsub.fish: echo "$(echo "$(echo a)")"
test('fish command substitution: cmdsub.fish - nested quoted $()', async () => {
	expect(await run('echo "$(echo "$(echo a)")"')).toBe('a');
});

// cmdsub.fish: echo "$(echo $(echo b))"
test('fish command substitution: cmdsub.fish - unquoted $() nested in quoted $()', async () => {
	expect(await run('echo "$(echo $(echo b))"')).toBe('b');
});

// cmdsub.fish: echo "$(echo multiple).$(echo command).$(echo substitutions)"
test('fish command substitution: cmdsub.fish - multiple quoted $() substitutions', async () => {
	expect(
		await run(
			'echo "$(echo multiple).$(echo command).$(echo substitutions)"'
		)
	).toBe('multiple.command.substitutions');
});

// cmdsub.fish: test -n "$()" || echo "empty list is interpolated to empty string"
test('fish command substitution: cmdsub.fish - quoted empty $() interpolates to an empty string', async () => {
	expect(
		await run(
			'test -n "$()" || echo "empty list is interpolated to empty string"'
		)
	).toBe('empty list is interpolated to empty string');
});

// cmdsub.fish: quoted command substitution preserves internal newlines.
test('fish command substitution: cmdsub.fish - quoted $() preserves inner newlines', async () => {
	const script = [
		'function lines',
		'    echo line 1',
		'    echo line 2',
		'end',
		'echo "$(lines)"',
	].join('\n');
	expect(await run(script)).toBe('line 1\nline 2');
});

// cmdsub.fish: echo trim any newlines "$(echo \n\n\n)" after cmdsub
// Adapted: echo emits a single empty line; the quoted result is empty.
test('fish command substitution: cmdsub.fish - quoted $() trims trailing newlines', async () => {
	expect(await run('echo x "$(echo)" y')).toBe('x  y');
});

// Unquoted substitutions trim inferred trailing newlines to an empty list.
test('fish command substitution: cmdsub.fish - inferred empty output is elided', async () => {
	expect(await run('echo before (echo) after')).toBe('before after');
});

// cmdsub.fish: echo "$(echo index\nrange\nexpansion)[2]"
test('fish command substitution: cmdsub.fish - quoted $() output can be indexed', async () => {
	const script = [
		'function irx',
		'    echo index',
		'    echo range',
		'    echo expansion',
		'end',
		'echo "$(irx)[2]"',
	].join('\n');
	expect(await run(script)).toBe('range');
});

// cmdsub.fish: echo "$(echo '"')"
test('fish command substitution: cmdsub.fish - quote characters nest inside quoted $()', async () => {
	expect(await run(`echo "$(echo '"')"`)).toBe('"');
});

// cmdsub.fish: echo "$(echo 1))"
test('fish command substitution: cmdsub.fish - literal paren after quoted $()', async () => {
	expect(await run('echo "$(echo 1))"')).toBe('1)');
});

// cmdsub.fish: echo "($(echo 1))"
test('fish command substitution: cmdsub.fish - literal parens around quoted $()', async () => {
	expect(await run('echo "($(echo 1))"')).toBe('(1)');
});

// cmdsub.fish: echo "$(echo 1) ( $(echo 2)"
test('fish command substitution: cmdsub.fish - lone paren between quoted $()', async () => {
	expect(await run('echo "$(echo 1) ( $(echo 2)"')).toBe('1 ( 2');
});

// cmdsub.fish: echo "$(echo A)B$(echo C)D"(echo E)
test('fish command substitution: cmdsub.fish - quoted $() concatenates with unquoted ()', async () => {
	expect(await run('echo "$(echo A)B$(echo C)D"(echo E)')).toBe('ABCDE');
});

// cmdsub.fish: echo "($(echo A)B$(echo C))"
test('fish command substitution: cmdsub.fish - text and quoted $() inside literal parens', async () => {
	expect(await run('echo "($(echo A)B$(echo C))"')).toBe('(ABC)');
});

// cmdsub.fish: echo "quoted1""quoted2"(echo unquoted3)"$(echo quoted4)_$(echo quoted5)"
test('fish command substitution: cmdsub.fish - adjacent quoted, unquoted, and $() segments', async () => {
	expect(
		await run(
			'echo "quoted1""quoted2"(echo unquoted3)"$(echo quoted4)_$(echo quoted5)"'
		)
	).toBe('quoted1quoted2unquoted3quoted4_quoted5');
});

// cmdsub.fish: var=a echo "$var$(echo b)"
test('fish command substitution: cmdsub.fish - command-scoped variable adjacent to quoted $()', async () => {
	expect(await run('var=a echo "$var$(echo b)"')).toBe('ab');
});

// cmdsub.fish: echo "\$(echo 1)"
test('fish command substitution: cmdsub.fish - escaped dollar in quotes prevents $()', async () => {
	expect(await run('echo "\\$(echo 1)"')).toBe('$(echo 1)');
});

// cmdsub.fish: echo "\$$(echo 1)"
test('fish command substitution: cmdsub.fish - escaped dollar before quoted $()', async () => {
	expect(await run('echo "\\$$(echo 1)"')).toBe('$1');
});

// cmdsub.fish: echo "$(echo '$@')"
test('fish command substitution: cmdsub.fish - dollar inside single quotes in quoted $()', async () => {
	expect(await run(`echo "$(echo '$@')"`)).toBe('$@');
});
