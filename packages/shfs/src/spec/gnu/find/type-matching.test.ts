// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/type_list.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// --- Negative tests: invalid -type/-xtype arguments ---

test('type_list: empty -type argument is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type ''"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain(
		'Arguments to -type should contain at least one letter'
	);
});

test('type_list: empty -xtype argument is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const result = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -xtype ''"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain(
		'Arguments to -xtype should contain at least one letter'
	);
});

test('type_list: non-separated type arguments (e.g. fd) are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const resultType = await harness.runWithStderr(
		'find /work/dir -mindepth 1 -type fd'
	);
	expect(resultType.status).toBe(1);
	expect(resultType.output).toContain(
		'Must separate multiple arguments to -type'
	);

	const resultXtype = await harness.runWithStderr(
		'find /work/dir -mindepth 1 -xtype fd'
	);
	expect(resultXtype.status).toBe(1);
	expect(resultXtype.output).toContain(
		'Must separate multiple arguments to -xtype'
	);
});

test('type_list: trailing comma in type list is rejected', async () => {
	await harness.ensureDir('/work/dir');

	const resultType = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,'"
	);
	expect(resultType.status).toBe(1);
	expect(resultType.output).toContain(
		'Last file type in list argument to -type is missing'
	);

	const resultXtype = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -xtype 'f,'"
	);
	expect(resultXtype.status).toBe(1);
	expect(resultXtype.output).toContain(
		'Last file type in list argument to -xtype is missing'
	);
});

test('type_list: duplicate entries in type list are rejected', async () => {
	await harness.ensureDir('/work/dir');

	const resultType = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -type 'f,f'"
	);
	expect(resultType.status).toBe(1);
	expect(resultType.output).toContain(
		'Duplicate file type'
	);

	const resultXtype = await harness.runWithStderr(
		"find /work/dir -mindepth 1 -xtype 'f,f'"
	);
	expect(resultXtype.status).toBe(1);
	expect(resultXtype.output).toContain(
		'Duplicate file type'
	);
});

// --- Positive tests: -type with file types ---

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

test('type_list: -type l matches symbolic links', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -type l'
	);
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['/work/dir/dangling-link', '/work/dir/reg-link'].join('\n')
	);
});

test('type_list: -xtype l matches only dangling symbolic links', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -xtype l'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/dir/dangling-link');
});

test('type_list: -type f,l matches regular files and symbolic links', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	const result = await harness.runWithStatus(
		"find /work/dir -mindepth 1 -type 'f,l'"
	);
	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['/work/dir/dangling-link', '/work/dir/reg', '/work/dir/reg-link']
			.join('\n')
	);
});

test('type_list: -xtype f,d matches files and dirs including symlink targets', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/subdir /work/dir/dir-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	const result = await harness.runWithStatus(
		"find /work/dir -mindepth 1 -xtype 'f,d'"
	);
	expect(result.status).toBe(0);
	// -xtype dereferences symlinks: reg-link→file, dir-link→dir both match;
	// dangling-link has no target type so it does not match f,d.
	const lines = sortedLines(result.output);
	expect(lines).toContain('/work/dir/reg');
	expect(lines).toContain('/work/dir/subdir');
	expect(lines).toContain('/work/dir/reg-link');
	expect(lines).toContain('/work/dir/dir-link');
	expect(lines).not.toContain('/work/dir/dangling-link');
});

test('type_list: -not -xtype l matches everything except dangling symlinks', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	const result = await harness.runWithStatus(
		'find /work/dir -mindepth 1 -not -xtype l'
	);
	expect(result.status).toBe(0);
	const lines = sortedLines(result.output);
	expect(lines).toContain('/work/dir/reg');
	expect(lines).toContain('/work/dir/subdir');
	expect(lines).toContain('/work/dir/reg-link');
	expect(lines).not.toContain('/work/dir/dangling-link');
});

test('type_list: full type list matches all entries', async () => {
	await harness.setTextFile('/work/dir/reg', '');
	await harness.ensureDir('/work/dir/subdir');
	await harness.run('ln -s /work/dir/reg /work/dir/reg-link');
	await harness.run('ln -s /work/dir/enoent /work/dir/dangling-link');

	// f,d,l should match everything present
	const result = await harness.runWithStatus(
		"find /work/dir -mindepth 1 -type 'f,d,l'"
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	expect(lines).toEqual(
		[
			'/work/dir/dangling-link',
			'/work/dir/reg',
			'/work/dir/reg-link',
			'/work/dir/subdir',
		]
	);
});
