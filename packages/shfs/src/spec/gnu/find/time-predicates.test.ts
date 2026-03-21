// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/arg-nan.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/newer.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/used.sh
// Copyright (C) 2020-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness, sortedLines } from './harness';

const harness = createFindHarness();

// arg-nan: Ensure 'not-a-number' diagnostic for NaN arguments.
test('arg-nan: time predicates reject NaN argument', async () => {
	await harness.ensureDir('/work');

	for (const opt of [
		'-used',
		'-amin',
		'-cmin',
		'-mmin',
		'-atime',
		'-ctime',
		'-mtime',
	]) {
		const result = await harness.runWithStderr(
			`find /work ${opt} NaN`
		);
		expect(result.status).not.toBe(0);
		expect(result.output).toContain('not-a-number');
	}
});

// newer: Exercise -anewer -cnewer -newer -newerXY.
// Creates three files with increasing timestamps and verifies that only file3
// is newer than file2 for all -newer variants.
test('newer: -newer reference file selects only newer files', async () => {
	// Create three files with distinct modification times.
	// file1 is oldest, file2 is the reference, file3 is newest.
	await harness.setTextFile('/work/file1', '');
	await harness.run('touch -t 202501010000.00 /work/file1');
	await harness.setTextFile('/work/file2', '');
	await harness.run('touch -t 202501020000.00 /work/file2');
	await harness.setTextFile('/work/file3', '');
	await harness.run('touch -t 202501030000.00 /work/file3');

	const result = await harness.runWithStatus(
		"find /work -newer /work/file2 -name 'file*'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/file3');
});

test('newer: -anewer selects files accessed after reference', async () => {
	await harness.setTextFile('/work/file1', '');
	await harness.run('touch -t 202501010000.00 /work/file1');
	await harness.setTextFile('/work/file2', '');
	await harness.run('touch -t 202501020000.00 /work/file2');
	await harness.setTextFile('/work/file3', '');
	await harness.run('touch -t 202501030000.00 /work/file3');

	const result = await harness.runWithStatus(
		"find /work -anewer /work/file2 -name 'file*'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/file3');
});

test('newer: -cnewer selects files with status change after reference', async () => {
	await harness.setTextFile('/work/file1', '');
	await harness.run('touch -t 202501010000.00 /work/file1');
	await harness.setTextFile('/work/file2', '');
	await harness.run('touch -t 202501020000.00 /work/file2');
	await harness.setTextFile('/work/file3', '');
	await harness.run('touch -t 202501030000.00 /work/file3');

	const result = await harness.runWithStatus(
		"find /work -cnewer /work/file2 -name 'file*'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/file3');
});

test('newer: -newerXY variants using reference file', async () => {
	await harness.setTextFile('/work/file1', '');
	await harness.run('touch -t 202501010000.00 /work/file1');
	await harness.setTextFile('/work/file2', '');
	await harness.run('touch -t 202501020000.00 /work/file2');
	await harness.setTextFile('/work/file3', '');
	await harness.run('touch -t 202501030000.00 /work/file3');

	// All -newerXY variants with reference file should select only file3.
	for (const opt of [
		'-neweraa',
		'-newerac',
		'-neweram',
		'-newerca',
		'-newercc',
		'-newercm',
		'-newerma',
		'-newermc',
		'-newermm',
	]) {
		const result = await harness.runWithStatus(
			`find /work ${opt} /work/file2 -name 'file*'`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe('/work/file3');
	}
});

test('newer: -newerXt variants using reference timestamp', async () => {
	await harness.setTextFile('/work/file1', '');
	await harness.run('touch -t 202501010000.00 /work/file1');
	await harness.setTextFile('/work/file2', '');
	await harness.run('touch -t 202501020000.00 /work/file2');
	await harness.setTextFile('/work/file3', '');
	await harness.run('touch -t 202501030000.00 /work/file3');

	const refTime = '2025-01-02 00:00:00';

	for (const opt of ['-newerat', '-newerct', '-newermt']) {
		const result = await harness.runWithStatus(
			`find /work ${opt} '${refTime}' -name 'file*'`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe('/work/file3');
	}
});

// used: Verify find -used works.
// -used N tests: file access time minus status change time, in days.
test('used: -used with positive values selects files by access-ctime delta', async () => {
	// Create files with access dates 10, 20, 30, 40 days in the future
	// relative to their status change time.
	for (const d of [10, 20, 30, 40]) {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + d);
		const ts = [
			futureDate.getFullYear(),
			String(futureDate.getMonth() + 1).padStart(2, '0'),
			String(futureDate.getDate()).padStart(2, '0'),
			String(futureDate.getHours()).padStart(2, '0'),
			String(futureDate.getMinutes()).padStart(2, '0'),
			'.',
			String(futureDate.getSeconds()).padStart(2, '0'),
		].join('');

		await harness.setTextFile(`/work/t${d}`, '');
		// Set access time to the future date while keeping mtime/ctime at now.
		await harness.run(
			`touch -a -t ${ts} /work/t${d}`
		);
	}
	// File with timestamp now (access-ctime delta ~= 0).
	await harness.setTextFile('/work/t00', '');

	// -used -N: files whose access time is less than N days after ctime.
	const usedMinus5 = await harness.runWithStatus(
		"find /work -type f -name 't*' -used -5"
	);
	expect(usedMinus5.status).toBe(0);
	expect(sortedLines(usedMinus5.output)).toBe('./t00');

	// -used +0: files whose access time is more than 0 days after ctime.
	const usedPlus0 = await harness.runWithStatus(
		"find /work -type f -name 't*' -used +0"
	);
	expect(usedPlus0.status).toBe(0);
	const plus0Lines = usedPlus0.output.split('\n').sort();
	expect(plus0Lines).toContain('/work/t10');
	expect(plus0Lines).toContain('/work/t20');
	expect(plus0Lines).toContain('/work/t30');
	expect(plus0Lines).toContain('/work/t40');

	// -used +35: only files with delta > 35 days.
	const usedPlus35 = await harness.runWithStatus(
		"find /work -type f -name 't*' -used +35"
	);
	expect(usedPlus35.status).toBe(0);
	expect(usedPlus35.output).toBe('/work/t40');

	// -used +45: nothing matches (max delta is 40).
	const usedPlus45 = await harness.runWithStatus(
		"find /work -type f -name 't*' -used +45"
	);
	expect(usedPlus45.status).toBe(0);
	expect(usedPlus45.output).toBe('');
});
