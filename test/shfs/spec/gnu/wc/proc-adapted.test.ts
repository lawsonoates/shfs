// Translated/adapted from deterministic portions of GNU coreutils
// tests/wc/wc-proc.sh.
// Copyright (C) 2014-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();
const LARGE_REGULAR_FILE_SIZE = 1024 * 1024;
const SMALL_REGULAR_FILE_SIZE = 2;

test('gnu wc: wc-proc.sh - virtual /proc files are counted from their contents', async () => {
	const content = 'Linux version from a virtual proc file\n';
	await harness.setTextFile('/proc/version', content);
	await harness.setTextFile('/copy', content);

	const expected = await harness.run('wc -c < /copy');
	const actual = await harness.run('wc -c < /proc/version');

	expect(actual).toBe(expected);
});

test('gnu wc: wc-proc.sh - byte counts and totals use virtual file sizes', async () => {
	await harness.setFile('/no_read', new Uint8Array(SMALL_REGULAR_FILE_SIZE));
	await harness.setFile('/do_read', new Uint8Array(LARGE_REGULAR_FILE_SIZE));

	const result = await harness.run('wc -c no_read do_read');
	const totalSize = SMALL_REGULAR_FILE_SIZE + LARGE_REGULAR_FILE_SIZE;

	expect(result).toBe(
		`      2 no_read\n${LARGE_REGULAR_FILE_SIZE} do_read\n${totalSize} total`
	);
});

// The remaining upstream checks cover read avoidance, shared input offsets, and
// timeout-bounded huge sparse files. Those are host-kernel behaviors, not shfs
// virtual-filesystem semantics.
