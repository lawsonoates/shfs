// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/depth-unreadable-dir.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/files0-from.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/many-dir-entries-vs-OOM.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/type_list.sh
// Copyright (C) 2011-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// files0-from: find defaults to the current directory when no starting path is given.
test('gnu find: files0-from.sh - find with no args defaults to the current directory', async () => {
	await harness.ensureDir('/work');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -maxdepth 0');
	expect(result.status).toBe(0);
	expect(result.output).toBe('.');
});

// files0-from: regular recursion from a starting path remains the default.
test('gnu find: files0-from.sh - recursion includes the starting path and descendants', async () => {
	await harness.ensureDir('/work/d1/d2/d3');
	await harness.setTextFile('/work/d1/d2/d3/file', '');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find d1');
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['d1', 'd1/d2', 'd1/d2/d3', 'd1/d2/d3/file'].join('\n')
	);
});

// files0-from: -maxdepth 0 prevents recursion into discovered descendants.
test('gnu find: files0-from.sh - -maxdepth 0 lists only the starting path', async () => {
	await harness.ensureDir('/work/d1/d2/d3');
	await harness.setTextFile('/work/d1/d2/d3/file', '');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find d1 -maxdepth 0');
	expect(result.status).toBe(0);
	expect(result.output).toBe('d1');
});

// type_list: -mindepth suppresses the starting path while keeping deeper matches.
test('gnu find: type_list.sh - -mindepth 1 suppresses the starting path', async () => {
	await harness.setTextFile('/work/tree/root-file', '');
	await harness.ensureDir('/work/tree/sub');
	await harness.setTextFile('/work/tree/sub/leaf', '');

	const result = await harness.runWithStatus('find /work/tree -mindepth 1');
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['/work/tree/root-file', '/work/tree/sub', '/work/tree/sub/leaf'].join(
			'\n'
		)
	);
});

// depth-unreadable-dir: adapt the original -depth regression to the subset's
// deterministic traversal ordering without depending on permission behavior.
test('gnu find: depth-unreadable-dir.sh - -depth visits children before their parent directories', async () => {
	await harness.setTextFile('/work/tmp/dir/file', '');

	const result = await harness.runWithStatus('find /work/tmp -depth');
	expect(result.status).toBe(0);
	expect(result.output.split('\n')).toEqual([
		'/work/tmp/dir/file',
		'/work/tmp/dir',
		'/work/tmp',
	]);
});

// many-dir-entries-vs-OOM: Verify that find does not have excessive memory
// consumption even for large directories.
test('gnu find: many-dir-entries-vs-OOM.sh - find handles large directories without error', async () => {
	const count = 10_000;

	await harness.ensureDir('/work/dir');
	for (let i = 1; i <= count; i++) {
		await harness.setTextFile(`/work/dir/${i}`, '');
	}

	const result = await harness.runWithStatus('find /work/dir -type f');
	expect(result.status).toBe(0);

	const lines = result.output.split('\n').filter((l) => l !== '');
	expect(lines.length).toBe(count);
});

test('gnu find: many-dir-entries-vs-OOM.sh - find with -name filter on large directory', async () => {
	const count = 1000;

	await harness.ensureDir('/work/dir');
	for (let i = 1; i <= count; i++) {
		await harness.setTextFile(`/work/dir/${i}`, '');
	}

	// Only files whose name is exactly "500".
	const result = await harness.runWithStatus('find /work/dir -name 500');
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/dir/500');
});
