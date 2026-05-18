// Translated/adapted from peteretelej/tree tests/integration_tests.rs.
// Copyright (c) 2023 Peter Etelej
// License: MIT.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu tree: integration_tests.rs - -A uses ASCII-style line drawing', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -A ${root}`);

	expect(
		output.includes('|') || output.includes('`') || output.includes('+')
	).toBe(true);
});

test('gnu tree: integration_tests.rs - -f prints full path prefixes', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -f ${root}`);

	Harness.expectContains(output, root);
	Harness.expectContains(output, `${root}/src/main.rs`);
});

test('gnu tree: integration_tests.rs - -F classifies directories with trailing slash', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -F ${root}`);

	Harness.expectContains(output, 'src/');
	Harness.expectContains(output, 'docs/');
});

test('gnu tree: integration_tests.rs - --noreport suppresses the summary report', async () => {
	const root = await harness.setupReferenceTree();

	const withReport = await harness.run(`tree ${root}`);
	const withoutReport = await harness.run(`tree --noreport ${root}`);

	expect(
		withReport.includes('directories') || withReport.includes('files')
	).toBe(true);
	expect(withoutReport.length).toBeLessThan(withReport.length);
	expect(withoutReport.includes('directories')).toBe(false);
	expect(withoutReport.includes('files')).toBe(false);
});
