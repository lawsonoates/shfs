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

import { Harness } from '../../../../harness';

const harness = Harness.create();
const cases = Harness.parseAtDelimitedCorpus('spencer2.tests', [3]);

for (const testCase of cases) {
	test(`gnu grep: spencer2.tests:${testCase.line} - Spencer corpus case`, async () => {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -E -e ${Harness.quote(testCase.pattern)} /tmp/in.txt`
		);

		expect(status).toBe(testCase.expectedStatus);
	});
}
