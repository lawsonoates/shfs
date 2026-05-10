// Translated/adapted from GNU findutils DejaGNU xargs POSIX tests:
// - xargs/testsuite/xargs.posix/empty.exp
// - xargs/testsuite/xargs.posix/n1.exp
// - xargs/testsuite/xargs.posix/n2.exp
// - xargs/testsuite/xargs.posix/n3.exp
// - xargs/testsuite/xargs.posix/L3.exp
// - xargs/testsuite/xargs.posix/quotes.exp
// - xargs/testsuite/xargs.posix/space.exp
// - xargs/testsuite/xargs.posix/EEOF.exp
// - xargs/testsuite/xargs.posix/E_.exp
// - xargs/testsuite/xargs.posix/IARG.exp
// Copyright (C) 2001-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../../../harness';

const harness = Harness.create();

const XARGS_POSIX_CASES = [
	'empty',
	'n1',
	'n2',
	'n3',
	'L3',
	'quotes',
	'space',
	'EEOF',
	'E_',
	'IARG',
] as const;

for (const testName of XARGS_POSIX_CASES) {
	test(`gnu xargs: ${testName}.exp - matches GNU findutils expected output`, async () => {
		const result = await harness.runDejaGnuCase('xargs.posix', testName);

		expect(result.actualExitCode).toBe(result.expectedExitCode);
		expect(result.actualOutput).toBe(result.expectedOutput);
		if (result.expectedStderr !== null) {
			expect(result.actualStderr).toBe(result.expectedStderr);
		}
	});
}
