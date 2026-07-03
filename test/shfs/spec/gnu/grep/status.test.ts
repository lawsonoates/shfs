// Translated/adapted from GNU grep tests/status.
// Upstream discards all output and asserts exit codes only:
//   0 match found, 1 no match, 2 file not found.
// Extensions beyond upstream: #3 additionally asserts the stderr
// diagnostic GNU prints without -s, and the final case covers a missing
// operand among readable files (matches preserved, error reported).
// Copyright (C) 2001, 2006, 2009-2014 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();
const MISSING_PATH = 'MMMMMMMM.MMM';

test('gnu grep: status #1 - a match exits 0', async () => {
	const result = await harness.runWithStatus(
		`echo abcd | grep -E -e ${Harness.quote('abc')}`
	);

	expect(result.status).toBe(0);
});

test('gnu grep: status #2 - no match exits 1', async () => {
	const result = await harness.runWithStatus(
		`echo abcd | grep -E -e ${Harness.quote('zbc')}`
	);

	expect(result.status).toBe(1);
});

test('gnu grep: status #3 - a missing file exits 2 and reports a read error', async () => {
	const result = await harness.runWithStatus(
		`grep -E -e ${Harness.quote('abc')} ${MISSING_PATH}`
	);

	expect(result.status).toBe(2);
	expect(result.output).toBe('');
	expect(result.stderr).toContain('MMMMMMMM.MMM');
	expect(result.stderr).toContain('No such file');
});

test('gnu grep: status #4 - a missing file with -s exits 2', async () => {
	const result = await harness.runWithStatus(
		`grep -E -s -e ${Harness.quote('abc')} ${MISSING_PATH}`
	);

	expect(result.status).toBe(2);
});

test('gnu grep: status #5 - stdin match with a missing file operand still exits 2', async () => {
	const result = await harness.runWithStatus(
		`echo abcd | grep -E -s ${Harness.quote('abc')} - ${MISSING_PATH}`
	);

	expect(result.status).toBe(2);
});

test('gnu grep: status #6 - -q -s with a match exits 0 despite a missing file', async () => {
	const result = await harness.runWithStatus(
		`echo abcd | grep -E -q -s ${Harness.quote('abc')} ${MISSING_PATH} -`
	);

	expect(result.status).toBe(0);
});

test('gnu grep: status #7 - -q with a match exits 0 despite a missing file', async () => {
	const result = await harness.runWithStatus(
		`echo abcd | grep -E -q ${Harness.quote('abc')} ${MISSING_PATH} -`
	);

	expect(result.status).toBe(0);
});

test('gnu grep: status - missing operand among readable files preserves matches and exits 2', async () => {
	await harness.setTextFile('/a.txt', 'line-a\n');
	await harness.setTextFile('/b.txt', 'line-b\n');

	const result = await harness.runWithStatus(
		`grep line /a.txt ${MISSING_PATH} /b.txt`
	);

	expect(result.status).toBe(2);
	expect(result.output).toBe('/a.txt:line-a\n/b.txt:line-b');
	expect(result.stderr).toContain('MMMMMMMM.MMM');
	expect(result.stderr).toContain('No such file');
});
