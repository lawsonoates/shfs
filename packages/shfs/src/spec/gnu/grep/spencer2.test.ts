// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer2
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1.awk
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer2.tests
// Copyright (C) 1988 Henry Spencer.
// Copyright (C) 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { createGrepHarness, parseAtDelimitedCorpus, quote } from './harness';

const harness = createGrepHarness();
const cases = parseAtDelimitedCorpus('spencer2.tests', [3]);

for (const testCase of cases) {
	test(`spencer2 (spencer2.tests:${testCase.line})`, async () => {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -E -e ${quote(testCase.pattern)} /tmp/in.txt`
		);

		expect(status).toBe(testCase.expectedStatus);
	});
}
