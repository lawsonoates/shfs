// Translated/adapted from GNU coreutils tests/wc/wc-total.sh.
// Copyright (C) 2022-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createWcHarness } from './harness';

const harness = createWcHarness();

async function seedTotalFiles(): Promise<void> {
	await harness.setTextFile('/2b', '2\n');
	await harness.setTextFile('/2w', '2 words\n');
}

test('gnu wc: wc-total.sh - --total without a value is rejected', async () => {
	await seedTotalFiles();

	const result = await harness.runWithStatus('wc --total 2b 2w');

	expect(result.status).toBe(1);
});

test('gnu wc: wc-total.sh - --total=never suppresses the total line', async () => {
	await seedTotalFiles();

	const result = await harness.run('wc --total=never 2b 2w');

	expect(result).toBe(' 1  1  2 2b\n 1  2  8 2w');
});

test('gnu wc: wc-total.sh - --total=only prints only unpadded totals', async () => {
	await seedTotalFiles();

	const result = await harness.run('wc --total=only 2b 2w');

	expect(result).toBe('2 3 10');
});

test('gnu wc: wc-total.sh - --total=always prints a total for one file', async () => {
	await seedTotalFiles();

	const result = await harness.run('wc --total=always 2b');

	expect(result).toBe('1 1 2 2b\n1 1 2 total');
});

// The upstream overflow case creates a sparse 2 EiB host file and checks
// UINTMAX saturation. Sparse host files and host integer limits are outside
// the shfs virtual-filesystem boundary, so this port covers the deterministic
// --total modes above.
