// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1.awk
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1.tests
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1-locale
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/spencer1-locale.awk
// Copyright (C) 1988 Henry Spencer.
// Copyright (C) 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { createGrepHarness, parseAtDelimitedCorpus, quote } from './harness';

const harness = createGrepHarness();
const cases = parseAtDelimitedCorpus('spencer1.tests', [3]);

for (const testCase of cases) {
	test(`spencer1 (spencer1.tests:${testCase.line})`, async () => {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -E -e ${quote(testCase.pattern)} /tmp/in.txt`
		);

		expect(status).toBe(testCase.expectedStatus);
	});
}

test('spencer1-locale: locale harness corpus remains valid for UTF-8 sample cases', async () => {
	const utf8Cases = cases.filter(
		(testCase) =>
			testCase.pattern.includes('[:upper:]') ||
			testCase.pattern.includes('[:lower:]') ||
			testCase.pattern.includes('\\B')
	);

	for (const testCase of utf8Cases) {
		await harness.setTextFile('/tmp/in.txt', `${testCase.input}\n`);
		const { status } = await harness.runWithStatus(
			`grep -E -e ${quote(testCase.pattern)} /tmp/in.txt`
		);
		expect(status).toBe(testCase.expectedStatus);
	}
});
