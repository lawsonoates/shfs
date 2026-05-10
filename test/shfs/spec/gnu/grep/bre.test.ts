// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre.awk
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bre.tests
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../harness';

const harness = Harness.create();
const cases = Harness.parseAtDelimitedCorpus('bre.tests', [3]);

for (const testCase of cases) {
	test(`gnu grep: bre.tests:${testCase.line} - basic regular expression corpus case`, async () => {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -e ${Harness.quote(testCase.pattern)} /tmp/in.txt`
		);

		expect(status).toBe(testCase.expectedStatus);
	});
}
