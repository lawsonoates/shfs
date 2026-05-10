// Translated/adapted from peteretelej/tree tests/integration_tests.rs.
// Copyright (c) 2023 Peter Etelej
// License: MIT.

import { expect, test } from 'bun:test';

import {
	createTreeHarness,
	expectContains,
	expectNotContains,
} from './harness';

const harness = createTreeHarness();

test('gnu tree: integration_tests.rs - basic directory listing includes top-level entries', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree ${root}`);

	expectContains(output, 'README.md');
	expectContains(output, 'src');
	expectContains(output, 'tests');
	expectContains(output, 'docs');
});

test('gnu tree: integration_tests.rs - hidden files are omitted by default and included with -a', async () => {
	const root = await harness.setupReferenceTree();

	const outputWithoutHidden = await harness.run(`tree ${root}`);
	expectNotContains(outputWithoutHidden, '.gitignore');
	expectNotContains(outputWithoutHidden, '.git');

	const outputWithHidden = await harness.run(`tree -a ${root}`);
	expectContains(outputWithHidden, '.gitignore');
	expectContains(outputWithHidden, '.git');
});

test('gnu tree: integration_tests.rs - -L limits displayed depth', async () => {
	const root = await harness.setupReferenceTree();

	const levelOne = await harness.run(`tree -L 1 ${root}`);
	expectContains(levelOne, 'src');
	expectNotContains(levelOne, 'main.rs');

	const levelTwo = await harness.run(`tree -L 2 ${root}`);
	expectContains(levelTwo, 'src');
	expectContains(levelTwo, 'main.rs');
});

test('gnu tree: integration_tests.rs - -d lists directories only', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -d ${root}`);

	expectContains(output, 'src');
	expectContains(output, 'tests');
	expectContains(output, 'docs');
	expectNotContains(output, 'README.md');
	expectNotContains(output, 'main.rs');
});

test('gnu tree: integration_tests.rs - missing paths fail with a non-zero status', async () => {
	const result = await harness.runWithStatus('tree /nonexistent/path');

	expect(result.status).not.toBe(0);
});
