// Translated/adapted from fish-shell tests/checks/string.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/string.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: regex flags (-r), capture groups, `string escape`/`unescape`/`pad`/
// `shorten`/`collect`, NUL handling (join0/split0), visible-width handling,
// and --fields are out of scope. This subset covers match/replace glob basics
// plus length, sub, split, join, trim, and repeat.

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

// ── match / replace ─────────────────────────────────────────

test('fish string: string.fish - replace transforms matching text', async () => {
	expect(await run('string replace is was "blue is my favorite"')).toBe(
		'blue was my favorite'
	);
});

test('fish string: string.fish - replace applies to each provided input value', async () => {
	expect(await run('string replace . - a.b c.d')).toBe('a-b\nc-d');
});

test('fish string: string.fish - replace can read formatted stdin lines', async () => {
	expect(await run('echo a.b | string replace . -')).toBe('a-b');
});

test('fish string: string.fish - match supports fish-style wildcard patterns', async () => {
	expect(await run('string match "a*b" axxb')).toBe('axxb');
});

test('fish string: string.fish - match can read formatted stdin lines', async () => {
	expect(await run('echo axxb | string match "a*b"')).toBe('axxb');
});

test('fish string: string.fish - match -q suppresses output and drives and/or chaining', async () => {
	expect(
		await run('string match -q "a*" alpha; and echo yes; or echo no')
	).toBe('yes');
	expect(
		await run('string match -q "a*" beta; and echo yes; or echo no')
	).toBe('no');
});

test('fish string: string.fish - match status is exposed through $status', async () => {
	expect(await run('string match "a*" alpha > /dev/null; echo $status')).toBe(
		'0'
	);
	expect(await run('string match "a*" beta; echo $status')).toBe('1');
});

// string.fish: string match -v "c*" dog can cat diz; and echo "exit 0"
test('fish string: string.fish - match -v inverts glob matches', async () => {
	expect(
		await run('string match -v "c*" dog can cat diz; and echo "exit 0"')
	).toBe('dog\ndiz\nexit 0');
});

// string.fish: string match -v "d*" dog dan dat diz; or echo "exit 1"
test('fish string: string.fish - match -v with nothing left returns 1', async () => {
	expect(
		await run('string match -v "d*" dog dan dat diz; or echo "exit 1"')
	).toBe('exit 1');
});

// string.fish: string match -v "*" dog can cat diz; or echo ...
test('fish string: string.fish - match -v against match-all returns 1', async () => {
	expect(
		await run(
			'string match -v "*" dog can cat diz; or echo "no glob invert match"'
		)
	).toBe('no glob invert match');
});

// ── length ──────────────────────────────────────────────────

// string.fish: string length "hello, world"
test('fish string: string.fish - length prints the character count', async () => {
	expect(await run('string length "hello, world"')).toBe('12');
});

// string.fish: string length -q ""; and echo not zero length; or echo zero length
test('fish string: string.fish - length -q reports zero length through status', async () => {
	expect(
		await run(
			'string length -q ""; and echo not zero length; or echo zero length'
		)
	).toBe('zero length');
});

// string.fish: string length; or echo "missing argument returns 1"
test('fish string: string.fish - length with no input returns 1', async () => {
	expect(
		await run('string length; or echo "missing argument returns 1"')
	).toBe('missing argument returns 1');
});

test('fish string: string.fish - length handles multiple arguments', async () => {
	expect(await run('string length ab abcd')).toBe('2\n4');
});

// ── sub ─────────────────────────────────────────────────────

// string.fish: string sub --length 2 abcde
test('fish string: string.fish - sub --length truncates', async () => {
	expect(await run('string sub --length 2 abcde')).toBe('ab');
});

// string.fish: string sub -s 2 -l 2 abcde
test('fish string: string.fish - sub -s -l selects a middle slice', async () => {
	expect(await run('string sub -s 2 -l 2 abcde')).toBe('bc');
});

// string.fish: string sub --start=-2 abcde
test('fish string: string.fish - sub negative start counts from the end', async () => {
	expect(await run('string sub --start=-2 abcde')).toBe('de');
});

// string.fish: string sub --end=3 abcde
test('fish string: string.fish - sub --end truncates at the index', async () => {
	expect(await run('string sub --end=3 abcde')).toBe('abc');
});

// string.fish: string sub --end=-4 abcde
test('fish string: string.fish - sub negative end counts from the end', async () => {
	expect(await run('string sub --end=-4 abcde')).toBe('a');
});

// string.fish: string sub --start=2 --end=-2 abcde
test('fish string: string.fish - sub start and end combine', async () => {
	expect(await run('string sub --start=2 --end=-2 abcde')).toBe('bc');
});

// string.fish: string sub --start 0 abc
test('fish string: string.fish - sub start 0 is an error', async () => {
	const result = await runResult('string sub --start 0 abc');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("string sub: Invalid start value '0'");
});

// string.fish: string sub --length=-1 abcde
test('fish string: string.fish - sub negative length is an error', async () => {
	const result = await runResult('string sub --length=-1 abcde');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("string sub: Invalid length value '-1'");
});

// string.fish: string sub -s 2 -e -5 -l 3 abcde
test('fish string: string.fish - sub --end and --length are mutually exclusive', async () => {
	const result = await runResult('string sub -s 2 -e -5 -l 3 abcde');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		'string sub: invalid option combination, --end and --length are mutually exclusive'
	);
});

// ── split ───────────────────────────────────────────────────

// string.fish: string split . example.com
test('fish string: string.fish - split on a separator', async () => {
	expect(await run('string split . example.com')).toBe('example\ncom');
});

// string.fish: string split "" abc
test('fish string: string.fish - split with empty separator splits characters', async () => {
	expect(await run('string split "" abc')).toBe('a\nb\nc');
});

// string.fish: string split -r -m1 / /usr/local/bin/fish
test('fish string: string.fish - split -r -m1 splits once from the right', async () => {
	expect(await run('string split -r -m1 / /usr/local/bin/fish')).toBe(
		'/usr/local/bin\nfish'
	);
});

// string.fish: string split --max 1 --right 12 AB12CD
test('fish string: string.fish - split --max --right with multi-char separator', async () => {
	expect(await run('string split --max 1 --right 12 AB12CD')).toBe('AB\nCD');
});

// string.fish: string split
test('fish string: string.fish - split without a separator is an error', async () => {
	const result = await runResult('string split');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('string split: missing argument');
});

// string.fish: string split --max=-1 --right 12 AB12CD
test('fish string: string.fish - split negative max is an error', async () => {
	const result = await runResult('string split --max=-1 --right 12 AB12CD');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("string split: Invalid max value '-1'");
});

// ── join ────────────────────────────────────────────────────

// string.fish: seq 3 | string join ... (adapted to explicit arguments)
test('fish string: string.fish - join concatenates with the separator', async () => {
	expect(await run('string join ... 1 2 3')).toBe('1...2...3');
});

test('fish string: string.fish - join reads stdin lines', async () => {
	expect(await run('string split "" abc | string join -')).toBe('a-b-c');
});

// string.fish: string join
test('fish string: string.fish - join without a separator is an error', async () => {
	const result = await runResult('string join');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('string join: missing argument');
});

// ── trim ────────────────────────────────────────────────────

// string.fish: string trim " abc  "
test('fish string: string.fish - trim strips surrounding whitespace', async () => {
	expect(await run('string trim " abc  "')).toBe('abc');
});

// string.fish: string trim --right --chars=yz xyzzy zany
test('fish string: string.fish - trim --right --chars strips listed characters', async () => {
	expect(await run('string trim --right --chars=yz xyzzy zany')).toBe(
		'x\nzan'
	);
});

// ── repeat ──────────────────────────────────────────────────

// string.fish: string repeat -n 2 foo
test('fish string: string.fish - repeat -n repeats the string', async () => {
	expect(await run('string repeat -n 2 foo')).toBe('foofoo');
});

// string.fish: string repeat --count 2 foo
test('fish string: string.fish - repeat --count long flag', async () => {
	expect(await run('string repeat --count 2 foo')).toBe('foofoo');
});

// string.fish: string repeat 2 foo
test('fish string: string.fish - repeat positional count', async () => {
	expect(await run('string repeat 2 foo')).toBe('foofoo');
});

// string.fish: string repeat 2 -n 3
test('fish string: string.fish - repeat -n takes precedence over positional', async () => {
	expect(await run('string repeat 2 -n 3')).toBe('222');
});

// string.fish: echo foo | string repeat -n 2
test('fish string: string.fish - repeat reads stdin', async () => {
	expect(await run('echo foo | string repeat -n 2')).toBe('foofoo');
});

// string.fish: string repeat
test('fish string: string.fish - repeat without arguments is an error', async () => {
	const result = await runResult('string repeat');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('string repeat: missing argument');
});

// string.fish: string repeat foo
test('fish string: string.fish - repeat with a non-numeric count is an error', async () => {
	const result = await runResult('string repeat foo');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("string repeat: Invalid count value 'foo'");
});

// string.fish: string repeat -n2 -q foo; and echo "exit 0"
test('fish string: string.fish - repeat -q suppresses output', async () => {
	expect(await run('string repeat -n2 -q foo; and echo "exit 0"')).toBe(
		'exit 0'
	);
});

// string.fish: string repeat -n0 foo; or echo "exit 1"
test('fish string: string.fish - repeat zero times outputs nothing and fails', async () => {
	expect(await run('string repeat -n0 foo; or echo "exit 1"')).toBe('exit 1');
});

// ── subcommand dispatch ─────────────────────────────────────

// string.fish: string
test('fish string: string.fish - missing subcommand is an error', async () => {
	const result = await runResult('string');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('string: missing subcommand');
});

// string.fish: string abc
test('fish string: string.fish - invalid subcommand is an error', async () => {
	const result = await runResult('string abc');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('string abc: invalid subcommand');
});
