// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/printf_escape_c.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/printf_escapechars.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/printf_inode.sh
// Copyright (C) 2011-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

// printf_escape_c: The \c escape in -printf stops output for that -printf
// action. Subsequent actions still execute.
test('printf_escape_c: \\c stops output mid-format but subsequent actions still run', async () => {
	await harness.ensureDir('/work');
	await harness.run('cd /work');

	// Original: find . -maxdepth 0
	//   -printf 'hello^\cthere'     → outputs 'hello^' then stops
	//   -exec printf %s {} \;       → outputs '.'
	//   -printf '^world\n'          → outputs '^world\n'
	// Expected combined: 'hello^.^world'
	const result = await harness.runWithStatus(
		"find /work -maxdepth 0 " +
		"-printf 'hello^\\cthere' " +
		"-exec printf '%s' {} \\; " +
		"-printf '^world\\n'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('hello^/work^world');
});

// printf_escapechars: Verify -printf handles octal and letter escape sequences.
test('printf_escapechars: octal escapes produce correct byte values', async () => {
	await harness.ensureDir('/work');

	// \1 → 0x01, \02 → 0x02, \003 → 0x03, \0044 → 0x04 followed by '4'
	const result = await harness.runWithStatus(
		"find /work -maxdepth 0 " +
		"-printf 'OCTAL1: \\1\\n' " +
		"-printf 'OCTAL2: \\02\\n' " +
		"-printf 'OCTAL3: \\003\\n' " +
		"-printf 'OCTAL4: \\0044\\n'"
	);
	expect(result.status).toBe(0);

	const lines = result.output.split('\n');
	expect(lines[0]).toBe('OCTAL1: \x01');
	expect(lines[1]).toBe('OCTAL2: \x02');
	expect(lines[2]).toBe('OCTAL3: \x03');
	expect(lines[3]).toBe('OCTAL4: \x044');
});

test('printf_escapechars: \\0028 produces 0x02 followed by literal 8', async () => {
	await harness.ensureDir('/work');

	// \002 is octal for 0x02; '8' is not a valid octal digit so it's literal.
	const result = await harness.runWithStatus(
		"find /work -maxdepth 0 -printf 'OCTAL8: \\0028\\n'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('OCTAL8: \x028');
});

test('printf_escapechars: letter escapes \\a \\b \\f \\r \\t \\v produce correct bytes', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStatus(
		"find /work -maxdepth 0 " +
		"-printf 'BEL: \\a\\n' " +
		"-printf 'CR: \\r\\n' " +
		"-printf 'FF: \\f\\n' " +
		"-printf 'TAB: \\t\\n' " +
		"-printf 'VTAB: \\v\\n' " +
		"-printf 'BS: \\b\\n'"
	);
	expect(result.status).toBe(0);

	const lines = result.output.split('\n');
	expect(lines[0]).toBe('BEL: \x07');
	expect(lines[1]).toBe('CR: \r');
	expect(lines[2]).toBe('FF: \f');
	expect(lines[3]).toBe('TAB: \t');
	expect(lines[4]).toBe('VTAB: \x0B');
	expect(lines[5]).toBe('BS: \b');
});

test('printf_escapechars: \\\\ produces a literal backslash', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStatus(
		"find /work -maxdepth 0 -printf 'BACKSLASH: \\\\\\n'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('BACKSLASH: \\');
});

test('printf_escapechars: unrecognized escape \\z warns and passes through', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStderr(
		"find /work -maxdepth 0 -printf 'UNKNOWN: \\z\\n'"
	);
	expect(result.status).toBe(0);
	// GNU find warns about unrecognized escapes and outputs \z literally.
	expect(result.output).toContain('warning');
	expect(result.output).toContain('unrecognized escape');
});

// printf_inode: Verify that -printf %i produces the correct inode number,
// consistent with what ls -i would report.
test('printf_inode: -printf %i produces the inode number', async () => {
	await harness.setTextFile('/work/file', '');

	// Get inode via ls -i.
	const lsResult = await harness.runWithStatus('ls -i /work/file');
	expect(lsResult.status).toBe(0);
	// ls -i output format: "INODE_NUM file"
	const lsInode = lsResult.output.trim().split(/\s+/)[0];

	// Get inode via find -printf %i.
	const findResult = await harness.runWithStatus(
		"find /work/file -printf '%i\\n'"
	);
	expect(findResult.status).toBe(0);
	const findInode = findResult.output.trim();

	expect(findInode).toBe(lsInode);
});

// Additional -printf format directives.
test('printf_inode: -printf %i_%p produces inode_path format', async () => {
	await harness.setTextFile('/work/file', '');

	const result = await harness.runWithStatus(
		"find /work/file -printf '%i_%p\\n'"
	);
	expect(result.status).toBe(0);
	// Output should be "INODE_/work/file" — the inode is a number.
	expect(result.output).toMatch(/^\d+_\/work\/file$/);
});
