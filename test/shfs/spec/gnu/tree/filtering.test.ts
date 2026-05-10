// Translated/adapted from peteretelej/tree tests/integration_tests.rs.
// Copyright (c) 2023 Peter Etelej
// License: MIT.

import { test } from 'bun:test';

import {
	createTreeHarness,
	expectContains,
	expectNotContains,
} from './harness';

const harness = createTreeHarness();

test('gnu tree: integration_tests.rs - -P includes files matching a wildcard pattern', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -P '*.md' ${root}`);

	expectContains(output, 'README.md');
	expectContains(output, 'guide.md');
	expectNotContains(output, 'main.rs');
	expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - -P supports pipe-separated alternate patterns', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree --prune -P '*.rs|*.md' ${root}`);

	expectContains(output, 'src');
	expectContains(output, 'tests');
	expectContains(output, 'docs');
	expectContains(output, 'main.rs');
	expectContains(output, 'test.rs');
	expectContains(output, 'README.md');
	expectContains(output, 'guide.md');
	expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - --matchdirs applies -P to directory names', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(
		`tree --prune -P 'src|docs' --matchdirs ${root}`
	);

	expectContains(output, 'src');
	expectContains(output, 'docs');
	expectContains(output, 'guide.md');
	expectContains(output, 'main.rs');
	expectNotContains(output, 'tests');
	expectNotContains(output, 'README.md');
	expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - -I excludes files matching a wildcard pattern', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -I '*.rs' ${root}`);

	expectContains(output, 'README.md');
	expectNotContains(output, 'main.rs');
	expectNotContains(output, 'test.rs');
});

test('gnu tree: integration_tests.rs - -I supports pipe-separated alternate patterns', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -I 'src|docs' ${root}`);

	expectNotContains(output, 'src');
	expectNotContains(output, 'docs');
	expectContains(output, 'tests');
	expectContains(output, 'README.md');
});
