// Translated/adapted from GNU coreutils tests/head/head-n0.sh.
// Deviations: upstream exercises both -n 0 and -c 0; -c (byte counts) is
// unsupported here, so only the -n variant is ported. The final case
// extends upstream coverage with a missing operand among readable files
// (GNU head reports the error and continues with the remaining operands).
// Copyright (C) 2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu head: head-n0.sh missing1 - a missing file reports a read error and exits 1', async () => {
	const result = await harness.runWithStatus('head -n 0 missing1');

	expect(result.status).toBe(1);
	expect(result.output).toBe('');
	expect(result.stderr).toBe(
		"head: cannot open 'missing1' for reading: No such file or directory"
	);
});

test('gnu head: head-n0.sh missing1 missing2 - multiple missing files report each read error', async () => {
	const result = await harness.runWithStatus('head -n 0 missing1 missing2');

	expect(result.status).toBe(1);
	expect(result.output).toBe('');
	expect(result.stderr).toBe(
		"head: cannot open 'missing1' for reading: No such file or directory\n" +
			"head: cannot open 'missing2' for reading: No such file or directory"
	);
});

test('gnu head: head-n0.sh - missing operand among readable files preserves other output', async () => {
	await harness.setTextFile('/a.txt', 'line-a\n');
	await harness.setTextFile('/b.txt', 'line-b\n');

	const result = await harness.runWithStatus('head /a.txt /missing /b.txt');

	expect(result.status).toBe(1);
	expect(result.output).toBe(
		'==> /a.txt <==\nline-a\n\n==> /b.txt <==\nline-b'
	);
	expect(result.stderr).toContain('/missing');
	expect(result.stderr).toContain('No such file');
});
