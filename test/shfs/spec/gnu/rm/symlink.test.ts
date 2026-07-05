// Translated/adapted from GNU coreutils tests:
// - tests/rm/dangling-symlink.sh
// Copyright (C) 2002-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu rm: dangling-symlink.sh - rm removes dangling and non-dangling symlink operands', async () => {
	await harness.ensureDir('/work');
	await harness.fs.symlink('no-file', '/work/dangle');
	await harness.fs.symlink('/', '/work/symlink');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('rm dangle symlink');

	expect(result.status).toBe(0);
	expect(await harness.fs.exists('/work/dangle')).toBe(false);
	expect(await harness.fs.exists('/work/symlink')).toBe(false);
	expect(await harness.fs.exists('/')).toBe(true);
});
