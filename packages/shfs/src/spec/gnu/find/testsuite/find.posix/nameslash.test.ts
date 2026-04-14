// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.posix/nameslash.exp
// - find/testsuite/find.posix/nameslash.xo
// Copyright (C) 2022-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from '../../harness';

const harness = createFindHarness();

test('nameslash: trailing-slash start paths work with -o name matching', async () => {
	await harness.ensureDir('/work/tmp/foo');
	await harness.ensureDir('/work/tmp/bar');

	const result = await harness.runWithStatus(
		"find /work/tmp/foo/// /work/tmp/bar/// -name foo -o -name 'bar?*'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/tmp/foo');
});
