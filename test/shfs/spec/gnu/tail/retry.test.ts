// Translated/adapted from GNU coreutils tests/tail/retry.sh.
// Deviations: --retry (and --follow) are unsupported here, so the flag is
// dropped and the 'tail: warning: --retry ignored' line is not expected;
// the missing-file error and exit status are unchanged from upstream. The
// final case extends upstream coverage with a missing operand among
// readable files (GNU tail reports the error and continues with the
// remaining operands).
// Copyright (C) 2013-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu tail: retry.sh - a missing file reports a read error and exits 1', async () => {
	const result = await harness.runWithStatus('tail missing');

	expect(result.status).toBe(1);
	expect(result.output).toBe('');
	expect(result.stderr).toBe(
		"tail: cannot open 'missing' for reading: No such file or directory"
	);
});

test('gnu tail: retry.sh - missing operand among readable files preserves other output', async () => {
	await harness.setTextFile('/a.txt', 'line-a\n');
	await harness.setTextFile('/b.txt', 'line-b\n');

	const result = await harness.runWithStatus('tail /a.txt /missing /b.txt');

	expect(result.status).toBe(1);
	expect(result.output).toBe(
		'==> /a.txt <==\nline-a\n\n==> /b.txt <==\nline-b'
	);
	expect(result.stderr).toContain('/missing');
	expect(result.stderr).toContain('No such file');
});
