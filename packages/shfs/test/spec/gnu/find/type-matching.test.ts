// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/type_list.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '@test/harness';

const harness = Harness.create();

// --- Negative tests: invalid -type arguments ---

test('gnu find: type_list.sh - empty -type argument is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type ''"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Arguments to -type should contain at least one letter'
	);
});

test('gnu find: type_list.sh - non-separated type arguments (e.g. fd) are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		'find /work/dir -mindepth 1 -type fd'
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Must separate multiple arguments to -type'
	);
});

test('gnu find: type_list.sh - trailing comma in type list is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,'"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		'Last file type in list argument to -type is missing'
	);
});

test('gnu find: type_list.sh - duplicate entries in type list are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,f'"
	);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('Duplicate file type');
});

// --- Positive tests: -type with in-scope file types ---

test('gnu find: type_list.sh - -type f matches only regular files', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.fs.symlink('reg', '/work/dir/reg-link');
	await harness.fs.symlink('subdir', '/work/dir/dir-link');
	await harness.fs.symlink('enoent', '/work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type f'
	);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe('/work/dir/reg');
});

test('gnu find: type_list.sh - -type d matches only directories', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.fs.symlink('reg', '/work/dir/reg-link');
	await harness.fs.symlink('subdir', '/work/dir/dir-link');
	await harness.fs.symlink('enoent', '/work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type d'
	);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe('/work/dir/subdir');
});

test('gnu find: type_list.sh - -type l matches symbolic links including dangling links', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.fs.symlink('reg', '/work/dir/reg-link');
	await harness.fs.symlink('subdir', '/work/dir/dir-link');
	await harness.fs.symlink('enoent', '/work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type l'
	);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe(
		[
			'/work/dir/dangling-link',
			'/work/dir/dir-link',
			'/work/dir/reg-link',
		].join('\n')
	);
});

test('gnu find: type_list.sh - -type f,d matches regular files and directories', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.fs.symlink('reg', '/work/dir/reg-link');
	await harness.fs.symlink('subdir', '/work/dir/dir-link');
	await harness.fs.symlink('enoent', '/work/dir/dangling-link');

	const result = await harness.runWithStatus(
		"find /work/dir -mindepth 1 -type 'f,d'"
	);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe(
		['/work/dir/reg', '/work/dir/subdir'].sort().join('\n')
	);
});
