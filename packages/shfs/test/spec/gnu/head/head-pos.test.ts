// Translated/adapted from GNU coreutils tests/head/head-pos.sh.
// Deviations: shfs does not support the upstream parenthesized command group,
// so a function provides the same shared-stdin cursor. The fixture uses raw
// bytes to exercise head.c's binary-mode byte-copy contract at the same time.
// Copyright (C) 2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '@test/harness';

const harness = Harness.create();

test('gnu head: head-pos.sh - leaves shared stdin after the selected raw line', async () => {
	await harness.setFile('/in', new Uint8Array([0xfe, 0x0a, 0xff, 0x0a]));
	const script = [
		'function consume',
		'    head -n 1 > /dev/null',
		'    cat',
		'end',
		'cat /in | consume',
	].join('\n');

	expect(await harness.shell.$`${script}`.bytes()).toEqual(
		new Uint8Array([0xff, 0x0a])
	);
});
