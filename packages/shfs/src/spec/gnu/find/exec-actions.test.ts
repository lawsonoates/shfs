// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/exec-plus-last-file.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/execdir-fd-leak.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/sv-bug-66365-exec.sh
// Copyright (C) 2013-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// exec-plus-last-file: Verify that find invokes the command for -exec CMD {} +
// even when there is only one last single file argument in the final batch.
// See Savannah bug #48030.
//
// The original test creates 3719 files with carefully chosen name lengths
// (to trigger a specific ARG_MAX buffer boundary) and verifies all files
// are processed. We reproduce the same naming pattern.
test('exec-plus-last-file: -exec {} + processes all files including the last batch', async () => {
	const dir = '/work/RashuBug';
	const expected: string[] = [];

	// Create 901 files with 22-char names + 4-digit suffix (matching original).
	for (let i = 1; i <= 901; i++) {
		const name = `abcdefghijklmnopqrstuv${String(i).padStart(4, '0')}`;
		const path = `${dir}/${name}`;
		expected.push(path);
		await harness.setTextFile(path, '');
	}

	// Create 2818 files with 21-char names + 4-digit suffix (matching original).
	for (let i = 902; i <= 3719; i++) {
		const name = `abcdefghijklmnopqrstu${String(i).padStart(4, '0')}`;
		const path = `${dir}/${name}`;
		expected.push(path);
		await harness.setTextFile(path, '');
	}

	expected.sort();

	// Verify find discovers all 3719 files.
	const result = await harness.runWithStatus(
		`find ${dir} -type f`
	);
	expect(result.status).toBe(0);
	expect(result.output.split('\n').sort()).toEqual(expected);

	// Verify -exec echo {} + processes all files across all batches.
	// Each echo invocation outputs space-separated file paths on one line.
	const execResult = await harness.runWithStatus(
		`find ${dir} -type f -exec echo {} +`
	);
	expect(execResult.status).toBe(0);

	const execFiles = execResult.output
		.split('\n')
		.flatMap((line) => line.split(' '))
		.filter((s) => s !== '')
		.sort();
	expect(execFiles).toEqual(expected);
});

// execdir-fd-leak: Verify that find -execdir does not leak file descriptors.
// See Savannah bug #34976.
//
// The original test restricts file descriptors via ulimit and runs -execdir
// over many files in nested directories. We test that -execdir processes
// all files across multiple directories without error.
test('execdir-fd-leak: -execdir processes files across multiple directories', async () => {
	// Create test files in three directories, 98 each (matching original).
	const dirs = ['/work', '/work/one', '/work/two'];
	for (const d of dirs) {
		await harness.ensureDir(d);
	}

	for (let i = 3; i <= 100; i++) {
		const num = String(i).padStart(3, '0');
		for (const d of dirs) {
			await harness.setTextFile(`${d}/${num}`, '');
		}
	}

	// -execdir should run the command in each file's directory.
	const result = await harness.runWithStatus(
		'find /work -type f -execdir echo {} \\;'
	);
	expect(result.status).toBe(0);

	// Should have 294 lines (98 files * 3 directories).
	const lines = result.output.split('\n').filter((l) => l !== '');
	expect(lines.length).toBe(294);
});

// sv-bug-66365-exec: -exec CMD x{} + should treat '+' as literal (terminated
// by ';'), not as the multi-argument terminator, because '{}' is part of 'x{}'
// rather than standing alone.
// See Savannah bug #66365.
test('sv-bug-66365-exec: + after non-standalone {} is not treated as batch terminator', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStatus(
		"find /work -prune -exec echo 'x{}' + \\;"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('x/work +');
});
