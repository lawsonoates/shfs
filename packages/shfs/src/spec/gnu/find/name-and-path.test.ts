// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/name-lbracket-literal.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/name-slash.sh
// Copyright (C) 2011-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

// name-lbracket-literal: find -name treats unquoted '[' as a literal character.
// See Savannah bug #32043.
test('name-lbracket-literal: -name [ matches a file literally named [', async () => {
	await harness.setTextFile('/work/[', '');

	const result = await harness.runWithStatus(
		"find /work -name '[' -print"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/[');
});

// name-slash: -name with '/' in pattern should match nothing (basenames only).
test('name-slash: -name with slash in pattern matches nothing', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStatus(
		"find /work -name 'dir/file'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

test('name-slash: -name with slash warns about basename-only matching', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStderr(
		"find /work -name 'dir/file'"
	);
	expect(result.status).toBe(0);
	// GNU find warns: "matches against basenames only ... evaluate to false"
	expect(result.output).toContain('warning');
	expect(result.output).toContain('basenames');
});

test('name-slash: -nowarn suppresses slash-in-name warning', async () => {
	await harness.ensureDir('/work');

	const result = await harness.runWithStderr(
		"find /work -nowarn -name 'dir/file'"
	);
	expect(result.status).toBe(0);
	// With -nowarn, no warning should be emitted; output should be empty.
	expect(result.output).toBe('');
});

test('name-slash: -name / matches the root directory basename', async () => {
	const result = await harness.runWithStatus(
		"find / -maxdepth 0 -name '/'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/');
});

test('name-slash: -name / in POSIXLY_CORRECT mode matches root without warning', async () => {
	const result = await harness.runWithStderr(
		"POSIXLY_CORRECT=1 find / -maxdepth 0 -name '/'"
	);
	expect(result.status).toBe(0);
	// stdout should contain '/', no warnings
	expect(result.output).toBe('/');
});

test('name-slash: -warn -name / on root still matches without warning', async () => {
	const result = await harness.runWithStderr(
		"find / -warn -maxdepth 0 -name '/'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/');
});
