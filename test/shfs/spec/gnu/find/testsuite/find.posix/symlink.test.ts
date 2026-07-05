// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.posix/sv-bug-12181.exp
// - find/testsuite/find.posix/sv-bug-19605.exp
// - find/testsuite/find.posix/sv-bug-19613.exp
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

test('gnu find: sv-bug-19605.exp - -L reports a symlink loop even when predicates cannot match', async () => {
	await harness.ensureDir('/work/tmp');
	await harness.fs.symlink('a', '/work/tmp/b');
	await harness.fs.symlink('b', '/work/tmp/a');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -L tmp -false -print');
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
});

test('gnu find: sv-bug-19613.exp - -L reports symlink loops while still finding non-loop files', async () => {
	await harness.ensureDir('/work/tmp/subdir');
	await harness.fs.symlink('a', '/work/tmp/subdir/b');
	await harness.fs.symlink('b', '/work/tmp/subdir/a');
	await harness.setTextFile('/work/tmp/vanilla', '');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -L tmp -depth -type f');
	expect(result.status).toBe(1);
	expect(result.output).toBe('tmp/vanilla');
});

test('gnu find: sv-bug-25359.exp - -H does not dereference non-argument symlinks for -type l', async () => {
	await harness.ensureDir('/work/tmp');
	await harness.fs.symlink('/', '/work/tmp/symlink');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -H tmp -type l -print');
	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/symlink');
});
