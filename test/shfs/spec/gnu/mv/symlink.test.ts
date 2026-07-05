// Translated/adapted from GNU coreutils tests:
// - tests/mv/to-symlink.sh
// Copyright (C) 1999-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu mv: to-symlink.sh - mv replaces a destination symlink without modifying its target', async () => {
	await harness.setTextFile('/work/file', 'local');
	await harness.setTextFile('/work/target', 'remote');
	await harness.fs.symlink('target', '/work/symlink');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('mv -f file symlink');

	expect(result.status).toBe(0);
	expect(await harness.fs.exists('/work/file')).toBe(false);
	expect(await harness.readTextFile('/work/target')).toBe('remote');
	await expect(harness.fs.readLink('/work/symlink')).rejects.toThrow(
		'Not a symlink: /work/symlink'
	);
	expect(await harness.readTextFile('/work/symlink')).toBe('local');
});
