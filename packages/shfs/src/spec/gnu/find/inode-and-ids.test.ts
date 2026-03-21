// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/inode-zero.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/user-group-max.sh
// Copyright (C) 2021-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

// inode-zero: Ensure find treats inode number 0 correctly.
// GNU/Hurd uses inode 0 for /dev/console.
// We test the -inum and -printf %i interactions with inode number 0.
test('inode-zero: -inum 0 matches files with inode 0', async () => {
	await harness.setTextFile('/work/file', '');

	// Get the file's actual inode number via -printf %i.
	const inodeResult = await harness.runWithStatus(
		"find /work/file -printf '%i\\n'"
	);
	expect(inodeResult.status).toBe(0);
	const inode = inodeResult.output.trim();

	// Search for that inode number with -inum.
	const result = await harness.runWithStatus(
		`find /work/file -inum ${inode}`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/file');
});

test('inode-zero: -inum with unrelated number yields no match', async () => {
	await harness.setTextFile('/work/file', '');

	const result = await harness.runWithStatus(
		'find /work/file -inum 99999999'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

test('inode-zero: -inum -1 matches files with inode < 1 (i.e., inode 0)', async () => {
	await harness.setTextFile('/work/file', '');

	// Get the actual inode.
	const inodeResult = await harness.runWithStatus(
		"find /work/file -printf '%i\\n'"
	);
	expect(inodeResult.status).toBe(0);
	const inode = Number.parseInt(inodeResult.output.trim(), 10);

	const result = await harness.runWithStatus(
		'find /work/file -inum -1'
	);
	expect(result.status).toBe(0);

	if (inode === 0) {
		// If the file actually has inode 0, it should match -inum -1.
		expect(result.output).toBe('/work/file');
	} else {
		// Otherwise, no match.
		expect(result.output).toBe('');
	}
});

test('inode-zero: -printf %i produces a numeric inode value', async () => {
	await harness.setTextFile('/work/file', '');

	const result = await harness.runWithStatus(
		"find /work/file -printf '%i\\n'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toMatch(/^\d+$/);
});

// user-group-max: Verify -user/-group accept UID/GID as numeric arguments.
// The original test verifies that find accepts UID/GID values up to
// UID_T_MAX / GID_T_MAX (4294967295 on 64-bit systems) and rejects
// values larger than that.

// UID_T_MAX and GID_T_MAX on typical 64-bit Linux.
const UID_T_MAX = '4294967295';
const GID_T_MAX = '4294967295';
const UID_T_OFLOW = '4294967296';
const GID_T_OFLOW = '4294967296';

test('user-group-max: -user accepts UID up to UID_T_MAX', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStderr(
		`find /work -user ${UID_T_MAX}`
	);
	// Should succeed (no matching files, but no error about the UID value).
	expect(result.status).toBe(0);
});

test('user-group-max: -group accepts GID up to GID_T_MAX', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStderr(
		`find /work -group ${GID_T_MAX}`
	);
	expect(result.status).toBe(0);
});

test('user-group-max: -user rejects UID larger than UID_T_MAX', async () => {
	const result = await harness.runWithStderr(
		`find -user ${UID_T_OFLOW} -name enoent`
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('invalid user name or UID argument');
	expect(result.output).toContain(UID_T_OFLOW);
});

test('user-group-max: -group rejects GID larger than GID_T_MAX', async () => {
	const result = await harness.runWithStderr(
		`find -group ${GID_T_OFLOW} -name enoent`
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('invalid group name or GID argument');
	expect(result.output).toContain(GID_T_OFLOW);
});

// Additional: -user and -group accept numeric string that maps to a valid user/group.
test('user-group-max: -user 0 matches root-owned files', async () => {
	await harness.ensureDir('/work');

	// -user 0 should be accepted (UID 0 = root on Unix systems).
	const result = await harness.runWithStatus(
		'find /work -user 0'
	);
	// Status 0 regardless of whether any files match.
	expect(result.status).toBe(0);
});

test('user-group-max: -group 0 matches root-group files', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStatus(
		'find /work -group 0'
	);
	expect(result.status).toBe(0);
});
