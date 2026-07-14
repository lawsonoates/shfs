// Translated/adapted from fish-shell tests/checks/deep-cmdsub.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/deep-cmdsub.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Upstream issue 6503: deeply nested command substitutions must not hang.
// Reductions: `eval` and `seq` are out of scope, so the nesting is written
// out literally. Divergence: fish executes 64 levels; shfs enforces a
// deterministic maximum substitution depth and reports a parse error instead
// of executing arbitrarily deep nesting.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

function nested(depth: number, core: string): string {
	return `${'(echo '.repeat(depth)}${core}${')'.repeat(depth)}`;
}

// deep-cmdsub.fish:1-11: nested substitutions execute and capture correctly.
test('fish deep-cmdsub: deep-cmdsub.fish - nested substitutions resolve', async () => {
	expect(await shell.$`echo ${nested(8, 'hooray')}`.text()).toBe('hooray');
});

// deep-cmdsub.fish:1-11: exceeding the depth budget fails deterministically
// instead of hanging.
test('fish deep-cmdsub: deep-cmdsub.fish - excessive nesting is a deterministic error', async () => {
	const result = await shell.$`echo ${nested(64, 'hooray')}`.nothrow();
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr.toString()).toContain('substitution depth');
});
