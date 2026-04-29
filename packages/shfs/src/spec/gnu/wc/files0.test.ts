// Translated/adapted from GNU coreutils tests/wc/wc-files0.sh.
// Copyright (C) 2006-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createWcHarness, nulSeparated } from './harness';

const harness = createWcHarness();
const NAMES_PATH = '/names';
const LARGE_FILE_SIZE = 1024 * 1024;

async function seedFiles0Fixture(): Promise<void> {
	await harness.setTextFile('/2b', '2\n');
	await harness.setTextFile('/2w', '2 words\n');
	await harness.setFile(NAMES_PATH, nulSeparated('2b', '2w'));
}

test('wc-files0.sh: --files0-from reads NUL-delimited file list from a file', async () => {
	await seedFiles0Fixture();

	const result = await harness.run(`wc --files0-from=${NAMES_PATH}`);

	expect(result).toBe(' 1  1  2 2b\n 1  2  8 2w\n 2  3 10 total');
});

test('wc-files0.sh: --files0-from=- reads NUL-delimited file list from stdin', async () => {
	await seedFiles0Fixture();

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe(' 1  1  2 2b\n 1  2  8 2w\n 2  3 10 total');
});

test('wc-files0.sh: file names containing newlines are quoted on one output line', async () => {
	const newlineName = '1\n2';
	await harness.setTextFile(`/${newlineName}`, '');
	await harness.setFile(NAMES_PATH, nulSeparated(newlineName));

	const result = await harness.run(`wc --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe("0 0 0 '1'$'\\n''2'");
});

test('wc-files0.sh adapted: byte totals from --files0-from are accurate for large virtual files', async () => {
	await harness.setFile('/wc.big', new Uint8Array(LARGE_FILE_SIZE));
	await harness.setTextFile('/wc.small', '');
	await harness.setFile(NAMES_PATH, nulSeparated('wc.big', 'wc.small'));

	const result = await harness.run(`wc -c --files0-from=- < ${NAMES_PATH}`);

	expect(result).toBe(
		`${LARGE_FILE_SIZE} wc.big\n0 wc.small\n${LARGE_FILE_SIZE} total`
	);
});

// The upstream test uses a sparse 1 GiB file created by host truncate. shfs has
// a deterministic virtual filesystem without sparse-file metadata, so this port
// uses a bounded in-memory file while preserving the byte-counting assertion.
