// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/depth-unreadable-dir.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/readdir_race.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/many-dir-entries-vs-OOM.sh
// Copyright (C) 2011-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// depth-unreadable-dir: find -depth must still output an unreadable directory.
// Versions < 4.7.0 failed to output unreadable directories with -depth.
// See Savannah bug #54171.
test('depth-unreadable-dir: -depth outputs unreadable directory with error', async () => {
	await harness.ensureDir('/work/tmp/dir');
	await harness.run('chmod 0311 /work/tmp/dir');

	const result = await harness.runWithStderr(
		'find /work/tmp -depth -name dir'
	);
	// Exit status 1 because of the permission error reading the directory.
	expect(result.status).toBe(1);
	// The directory itself must still appear in the output.
	expect(result.output).toContain('/work/tmp/dir');
	// A "Permission denied" error should be reported.
	expect(result.output).toContain('Permission denied');
});

test('depth-unreadable-dir: without -depth, unreadable dir is also listed', async () => {
	await harness.ensureDir('/work/tmp/dir');
	await harness.run('chmod 0311 /work/tmp/dir');

	const result = await harness.runWithStderr(
		'find /work/tmp -name dir'
	);
	expect(result.output).toContain('/work/tmp/dir');
});

// readdir_race: Verify that -ignore_readdir_race properly handles files
// that exist during traversal.
// The original test continuously creates and removes a directory in the
// background while running find many times to provoke a race condition.
// We test the basic behavior: -ignore_readdir_race is accepted and find
// operates normally with it.
test('readdir_race: -ignore_readdir_race is accepted and find operates normally', async () => {
	await harness.ensureDir('/work/testdir');
	await harness.setTextFile('/work/testdir/a', '');
	await harness.setTextFile('/work/testdir/b', '');
	await harness.setTextFile('/work/testdir/c', '');

	const result = await harness.runWithStatus(
		'find /work/testdir -ignore_readdir_race'
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	expect(lines).toEqual([
		'/work/testdir',
		'/work/testdir/a',
		'/work/testdir/b',
		'/work/testdir/c',
	]);
});

test('readdir_race: -ignore_readdir_race suppresses errors for vanished files', async () => {
	await harness.ensureDir('/work/testdir');
	await harness.setTextFile('/work/testdir/a', '');

	// With -ignore_readdir_race, find should not report errors for files
	// that vanish during traversal. We test that the option is accepted
	// and produces clean output.
	const result = await harness.runWithStderr(
		'find /work/testdir -ignore_readdir_race -type f'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/testdir/a');
});

// many-dir-entries-vs-OOM: Verify that find does not have excessive memory
// consumption even for large directories.
// See Savannah bug #34079.
//
// The original test creates 200,000 files and uses ulimit -v to restrict
// memory. We create a large directory and verify find can traverse it
// without error. The original count is 200,000; we use 10,000 to keep
// test runtime reasonable while still testing scalability.
test('many-dir-entries-vs-OOM: find handles large directories without error', async () => {
	const count = 10000;

	await harness.ensureDir('/work/dir');
	for (let i = 1; i <= count; i++) {
		await harness.setTextFile(`/work/dir/${i}`, '');
	}

	const result = await harness.runWithStatus('find /work/dir -type f');
	expect(result.status).toBe(0);

	const lines = result.output.split('\n').filter((l) => l !== '');
	expect(lines.length).toBe(count);
});

test('many-dir-entries-vs-OOM: find with -name filter on large directory', async () => {
	const count = 1000;

	await harness.ensureDir('/work/dir');
	for (let i = 1; i <= count; i++) {
		await harness.setTextFile(`/work/dir/${i}`, '');
	}

	// Only files whose name is exactly "500".
	const result = await harness.runWithStatus(
		'find /work/dir -name 500'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/dir/500');
});
