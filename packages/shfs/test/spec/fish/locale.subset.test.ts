// Translated/adapted from fish-shell tests/checks/locale.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/locale.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream inspects encoded bytes through host `od` and exercises
// locale-dependent commands. This subset observes the same unquoted Unicode
// and hexadecimal escape spellings through deterministic shell output.

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

// locale.fish: echo -n A\u00FCA / echo -n C\u00FCC
// Adapted: echo's newline does not affect the decoded argument asserted here.
test('fish locale: locale.fish - lowercase Unicode escapes produce code points', async () => {
	expect(await run('echo A\\u00FCA')).toBe('AüA');
	expect(await run('echo C\\u00FCC')).toBe('CüC');
});

// locale.fish: echo \xc3\xb6 / echo \Xc3\Xb6
test('fish locale: locale.fish - hexadecimal byte escapes decode UTF-8 text', async () => {
	expect(await run('echo \\xc3\\xb6')).toBe('ö');
	expect(await run('echo \\Xc3\\Xb6')).toBe('ö');
});

// locale.fish: math 7 \x2b 7 / math 5 \X2b 5
// Adapted: echo observes the escaped plus sign without the out-of-scope math.
test('fish locale: locale.fish - hexadecimal ASCII escapes produce characters', async () => {
	expect(await run('echo \\x2b \\X2b')).toBe('+ +');
});
