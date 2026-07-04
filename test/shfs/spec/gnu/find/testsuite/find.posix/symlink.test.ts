// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.posix/sv-bug-12181.exp
// - find/testsuite/find.posix/sv-bug-25359.exp
// Copyright (C) 2007-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu find: sv-bug-12181.exp - -H follows a command-line symlink start path', async () => {
	await harness.ensureDir('/work/tmp');
	await harness.fs.symlink('tmp', '/work/link');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -H link');
	expect(result.status).toBe(0);
	expect(result.output).toBe('link');
});

test('gnu find: sv-bug-25359.exp - -H does not dereference non-argument symlinks for -type l', async () => {
	await harness.ensureDir('/work/tmp');
	await harness.fs.symlink('/', '/work/tmp/symlink');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -H tmp -type l -print');
	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/symlink');
});
