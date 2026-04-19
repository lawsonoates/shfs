// Translated/adapted from GNU findutils DejaGNU xargs GNU tests:
// - xargs/testsuite/xargs.gnu/0n3.exp
// - xargs/testsuite/xargs.gnu/n1-0.exp
// - xargs/testsuite/xargs.gnu/n2-0.exp
// - xargs/testsuite/xargs.gnu/n3-0.exp
// - xargs/testsuite/xargs.gnu/space-0.exp
// - xargs/testsuite/xargs.gnu/delim-o.exp
// - xargs/testsuite/xargs.gnu/r.exp
// - xargs/testsuite/xargs.gnu/empty-r.exp
// Copyright (C) 2001-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createXargsHarness } from '../../harness';

const harness = createXargsHarness();

const XARGS_GNU_CASES = [
	'0n3',
	'n1-0',
	'n2-0',
	'n3-0',
	'space-0',
	'delim-o',
	'r',
	'empty-r',
] as const;

for (const testName of XARGS_GNU_CASES) {
	test(`${testName}: GNU findutils xargs.gnu`, async () => {
		const result = await harness.runDejaGnuCase('xargs.gnu', testName);

		expect(result.actualExitCode).toBe(result.expectedExitCode);
		expect(result.actualOutput).toBe(result.expectedOutput);
		if (result.expectedStderr !== null) {
			expect(result.actualStderr).toBe(result.expectedStderr);
		}
	});
}
