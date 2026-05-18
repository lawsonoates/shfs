// Translated/adapted from peteretelej/tree tests/integration_tests.rs.
// Copyright (c) 2023 Peter Etelej
// License: MIT.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu tree: integration_tests.rs - basic directory listing includes top-level entries', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree ${root}`);

	Harness.expectContains(output, 'README.md');
	Harness.expectContains(output, 'src');
	Harness.expectContains(output, 'tests');
	Harness.expectContains(output, 'docs');
});

test('gnu tree: integration_tests.rs - hidden files are omitted by default and included with -a', async () => {
	const root = await harness.setupReferenceTree();

	const outputWithoutHidden = await harness.run(`tree ${root}`);
	Harness.expectNotContains(outputWithoutHidden, '.gitignore');
	Harness.expectNotContains(outputWithoutHidden, '.git');

	const outputWithHidden = await harness.run(`tree -a ${root}`);
	Harness.expectContains(outputWithHidden, '.gitignore');
	Harness.expectContains(outputWithHidden, '.git');
});

test('gnu tree: integration_tests.rs - -L limits displayed depth', async () => {
	const root = await harness.setupReferenceTree();

	const levelOne = await harness.run(`tree -L 1 ${root}`);
	Harness.expectContains(levelOne, 'src');
	Harness.expectNotContains(levelOne, 'main.rs');

	const levelTwo = await harness.run(`tree -L 2 ${root}`);
	Harness.expectContains(levelTwo, 'src');
	Harness.expectContains(levelTwo, 'main.rs');
});

test('gnu tree: integration_tests.rs - -d lists directories only', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -d ${root}`);

	Harness.expectContains(output, 'src');
	Harness.expectContains(output, 'tests');
	Harness.expectContains(output, 'docs');
	Harness.expectNotContains(output, 'README.md');
	Harness.expectNotContains(output, 'main.rs');
});

test('gnu tree: integration_tests.rs - missing paths fail with a non-zero status', async () => {
	const result = await harness.runWithStatus('tree /nonexistent/path');

	expect(result.status).not.toBe(0);
});
