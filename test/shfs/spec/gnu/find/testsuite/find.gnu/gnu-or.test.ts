// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.gnu/gnu-or.exp
// Copyright (C) 2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.
//
// Adaptation note:
// GNU's original test relies on -false and branch-local -print actions.
// SHFS subset does not support those predicates/actions yet, so this test
// keeps focus on the in-scope -or operator semantics.

import { expect, test } from 'bun:test';

import { createFindHarness } from '../../harness';

const harness = createFindHarness();

test('gnu find: gnu-or.exp - -or evaluates right branch when left branch is false', async () => {
	await harness.ensureDir('/work/tmp/fred/jim');

	const result = await harness.runWithStatus(
		"find /work/tmp -depth -name '__does-not-match__' -or -name 'jim'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/tmp/fred/jim');
});
