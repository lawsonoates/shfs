// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/type_list.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// --- Negative tests: invalid -type arguments ---

test('type_list: empty -type argument is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type ''"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Arguments to -type should contain at least one letter'
	);
});

test('type_list: non-separated type arguments (e.g. fd) are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		'find /work/dir -mindepth 1 -type fd'
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Must separate multiple arguments to -type'
	);
});

test('type_list: trailing comma in type list is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,'"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Last file type in list argument to -type is missing'
	);
});

test('type_list: duplicate entries in type list are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,f'"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('Duplicate file type');
});

// --- Positive tests: -type with in-scope file types ---

test('type_list: -type f matches only regular files', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type f'
	);
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe('/work/dir/reg');
});

test('type_list: -type d matches only directories', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type d'
	);
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe('/work/dir/subdir');
});

test('type_list: -type f,d matches regular files and directories', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');

	const result = await harness.runWithStatus(
		"find /work/dir -mindepth 1 -type 'f,d'"
	);
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['/work/dir/reg', '/work/dir/subdir'].sort().join('\n')
	);
});
