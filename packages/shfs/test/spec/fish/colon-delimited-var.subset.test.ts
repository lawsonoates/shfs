// Translated/adapted from fish-shell tests/checks/colon-delimited-var.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/colon-delimited-var.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream seeds exported variables through the host environment. This
// subset uses `set`, then covers the same quoted path-variable rendering.

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

// colon-delimited-var.fish: set PATH abc '' def; echo "$PATH"
test('fish path variables: colon-delimited-var.fish - quoted PATH joins with colons and maps empty entries to dot', async () => {
	expect(await run('set PATH abc \'\' def; echo "$PATH"')).toBe('abc:.:def');
});

// colon-delimited-var.fish: set CDPATH '' qqq; echo "$CDPATH"
test('fish path variables: colon-delimited-var.fish - quoted CDPATH maps a leading empty entry to dot', async () => {
	expect(await run('set CDPATH \'\' qqq; echo "$CDPATH"')).toBe('.:qqq');
});

// colon-delimited-var.fish: set MANPATH 123 '' 456; echo "$MANPATH"
test('fish path variables: colon-delimited-var.fish - quoted MANPATH preserves empty entries', async () => {
	expect(await run('set MANPATH 123 \'\' 456; echo "$MANPATH"')).toBe(
		'123::456'
	);
});
