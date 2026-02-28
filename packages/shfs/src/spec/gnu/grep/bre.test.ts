// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre.awk
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre.tests
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { createGrepHarness, parseAtDelimitedCorpus, quote } from './harness';

const harness = createGrepHarness();
const cases = parseAtDelimitedCorpus('bre.tests', [3]);

for (const testCase of cases) {
	test(`bre (bre.tests:${testCase.line})`, async () => {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -e ${quote(testCase.pattern)} /tmp/in.txt`
		);

		expect(status).toBe(testCase.expectedStatus);
	});
}
