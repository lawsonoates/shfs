// Translated/adapted from GNU coreutils tests/wc/wc-files0-from.pl.
// Copyright (C) 2006-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createWcHarness, nulSeparated } from './harness';

const harness = createWcHarness();
const NAMES_PATH = '/names';

async function setNames(content: string | Uint8Array): Promise<void> {
	await harness.setFile(NAMES_PATH, content);
}

test('wc-files0-from.pl f-extra-arg: rejects file operands with --files0-from', async () => {
	await setNames('a');

	const result = await harness.runWithStatus(
		`wc --files0-from=- no-such < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.stderr).toContain("extra operand 'no-such'");
	expect(result.stderr).toContain(
		'file operands cannot be combined with --files0-from'
	);
});

test('wc-files0-from.pl missing1: missing --files0-from file is an error', async () => {
	const result = await harness.runWithStatus('wc --files0-from=missing');

	expect(result.status).toBe(1);
	expect(result.stderr).toContain('missing');
	expect(result.stderr).toContain('No such file or directory');
});

test('wc-files0-from.pl missing2: missing listed files still produce total', async () => {
	await setNames(nulSeparated('missing', 'missing'));

	const result = await harness.runWithStatus(
		`wc --files0-from=- < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.output).toBe('0 0 0 total');
	expect(result.stderr).toContain('missing');
});

test('wc-files0-from.pl duplicate1: duplicate listed files are counted twice', async () => {
	await harness.setTextFile('/g', '');
	await setNames(nulSeparated('g', 'g'));

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe('0 0 0 g\n0 0 0 g\n0 0 0 total');
});

test("wc-files0-from.pl minus-in-stdin: '-' is rejected when names come from stdin", async () => {
	await setNames('-');

	const result = await harness.runWithStatus(
		`wc --files0-from=- < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.stderr).toContain(
		"when reading file names from standard input, no file name of '-' allowed"
	);
});

test('wc-files0-from.pl empty: empty names file produces no output', async () => {
	await setNames('');

	const result = await harness.run(`wc --files0-from=${NAMES_PATH}`);

	expect(result).toBe('');
});

test('wc-files0-from.pl empty-nonreg adapted: empty /dev/null produces no output', async () => {
	await harness.setTextFile('/dev/null', '');

	const result = await harness.run('wc --files0-from=/dev/null');

	expect(result).toBe('');
});

test('wc-files0-from.pl nul-1: one NUL is an invalid zero-length file name', async () => {
	await setNames('\0');

	const result = await harness.runWithStatus(
		`wc --files0-from=- < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.stderr).toContain('invalid zero-length file name');
});

test('wc-files0-from.pl nul-2: two NULs diagnose both empty file names', async () => {
	await setNames('\0\0');

	const result = await harness.runWithStatus(
		`wc --files0-from=- < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.output).toBe('0 0 0 total');
	const diagnostics =
		result.stderr.match(/invalid zero-length file name/g) ?? [];
	expect(diagnostics).toHaveLength(2);
});

test('wc-files0-from.pl 1: one file name without final NUL is accepted', async () => {
	await harness.setTextFile('/g', '');
	await setNames('g');

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe('0 0 0 g');
});

test('wc-files0-from.pl 1a: one file name with final NUL is accepted', async () => {
	await harness.setTextFile('/g', '');
	await setNames(nulSeparated('g'));

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe('0 0 0 g');
});

test('wc-files0-from.pl 2: two file names without final NUL include total', async () => {
	await harness.setTextFile('/g', '');
	await setNames('g\0g');

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe('0 0 0 g\n0 0 0 g\n0 0 0 total');
});

test('wc-files0-from.pl 2a: two file names with final NUL include total', async () => {
	await harness.setTextFile('/g', '');
	await setNames(nulSeparated('g', 'g'));

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe('0 0 0 g\n0 0 0 g\n0 0 0 total');
});

test('wc-files0-from.pl zero-len: valid names after empty names are still processed', async () => {
	await harness.setTextFile('/g', '');
	await setNames('\0g\0');

	const result = await harness.runWithStatus(
		`wc --files0-from=- < ${NAMES_PATH}`
	);

	expect(result.status).toBe(1);
	expect(result.output).toBe('0 0 0 g\n0 0 0 total');
	expect(result.stderr).toContain('invalid zero-length file name');
});
