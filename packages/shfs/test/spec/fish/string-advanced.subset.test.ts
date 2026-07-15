// Translated/adapted from fish-shell tests/checks/string-advanced.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/string-advanced.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

// string-advanced.fish: regex replacement case-conversion escapes.
test('fish string: string-advanced.fish - regex replacement can uppercase a capture', async () => {
	const shell = new Shell(new MemoryFS());
	expect(await shell.$`string replace -r 'a(.*)' '\U$0\E' abc`.text()).toBe(
		'ABC'
	);
});
