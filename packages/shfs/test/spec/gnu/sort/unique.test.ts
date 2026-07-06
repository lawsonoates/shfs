// Translated/adapted from GNU coreutils tests/sort/sort-unique.sh.
// Copyright (C) 2010-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';
import { setTextFile } from './utils';

let fs!: MemoryFS;
let $!: Shell['$'];

beforeEach(() => {
	fs = new MemoryFS();
	$ = new Shell(fs).$;
});

test('gnu sort: sort-unique.sh - -u emits one representative for each sorted line', async () => {
	await setTextFile(fs, '/in', '1\n2\n1\n3\n');

	expect(await $`sort -u /in`.text()).toBe('1\n2\n3');
});
