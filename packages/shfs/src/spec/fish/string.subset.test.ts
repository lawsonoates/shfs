// Translated/adapted from fish-shell tests/checks/string.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/string.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;
const UNSUPPORTED_STRING_FEATURE_REGEX = /string: unsupported|unsupported/i;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runNothrow(command: string): Promise<string> {
	return await shell.$`${command}`.nothrow().text();
}

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

test('fish string: string.fish - replace supports variable and command substitution', async () => {
	await run('set -g target TARGET');
	expect(
		await run('echo (string replace TARGET path /workspace/$target)')
	).toBe('/workspace/path');
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
	await run('string match "a*" alpha');
	expect(await run('echo $status')).toBe('0');

	await runNothrow('string match "a*" beta');
	expect(await run('echo $status')).toBe('1');
});

test('fish string: string.fish - requires a subcommand', async () => {
	await expect(run('string')).rejects.toThrow('string requires a subcommand');
});

test('fish string: string.fish - validates replace and match arity', async () => {
	await expect(run('string replace from to')).rejects.toThrow(
		'string replace requires pattern replacement text'
	);
	await expect(run('string match only_pattern')).rejects.toThrow(
		'string match requires pattern and value'
	);
});

test('fish string: string.fish - unsupported string subcommands are out of scope', async () => {
	await expect(run('string sub --start 2 abc')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
	await expect(run('string split . example.com')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
	await expect(run('string length hello')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
	await expect(run('string pad foo')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
});

test('fish string: string.fish - regex/invert/all flags are out of scope', async () => {
	await expect(run('string match -r "cat|dog" "nice dog"')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
	await expect(run('string match -v "c*" cat')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
	await expect(run('string replace -a " " _ "a b"')).rejects.toThrow(
		UNSUPPORTED_STRING_FEATURE_REGEX
	);
});
