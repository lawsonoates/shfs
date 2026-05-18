// Translated/adapted from peteretelej/tree tests/integration_tests.rs.
// Copyright (c) 2023 Peter Etelej
// License: MIT.

import { test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu tree: integration_tests.rs - -P includes files matching a wildcard pattern', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -P '*.md' ${root}`);

	Harness.expectContains(output, 'README.md');
	Harness.expectContains(output, 'guide.md');
	Harness.expectNotContains(output, 'main.rs');
	Harness.expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - -P supports pipe-separated alternate patterns', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree --prune -P '*.rs|*.md' ${root}`);

	Harness.expectContains(output, 'src');
	Harness.expectContains(output, 'tests');
	Harness.expectContains(output, 'docs');
	Harness.expectContains(output, 'main.rs');
	Harness.expectContains(output, 'test.rs');
	Harness.expectContains(output, 'README.md');
	Harness.expectContains(output, 'guide.md');
	Harness.expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - --matchdirs applies -P to directory names', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(
		`tree --prune -P 'src|docs' --matchdirs ${root}`
	);

	Harness.expectContains(output, 'src');
	Harness.expectContains(output, 'docs');
	Harness.expectContains(output, 'guide.md');
	Harness.expectContains(output, 'main.rs');
	Harness.expectNotContains(output, 'tests');
	Harness.expectNotContains(output, 'README.md');
	Harness.expectNotContains(output, '.gitignore');
});

test('gnu tree: integration_tests.rs - -I excludes files matching a wildcard pattern', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -I '*.rs' ${root}`);

	Harness.expectContains(output, 'README.md');
	Harness.expectNotContains(output, 'main.rs');
	Harness.expectNotContains(output, 'test.rs');
});

test('gnu tree: integration_tests.rs - -I supports pipe-separated alternate patterns', async () => {
	const root = await harness.setupReferenceTree();
	const output = await harness.run(`tree -I 'src|docs' ${root}`);

	Harness.expectNotContains(output, 'src');
	Harness.expectNotContains(output, 'docs');
	Harness.expectContains(output, 'tests');
	Harness.expectContains(output, 'README.md');
});
