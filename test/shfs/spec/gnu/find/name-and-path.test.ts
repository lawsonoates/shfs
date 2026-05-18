// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/name-lbracket-literal.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/name-slash.sh
// Copyright (C) 2011-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

// name-lbracket-literal: find -name treats unquoted '[' as a literal character.
// See Savannah bug #32043.
test('gnu find: name-lbracket-literal.sh - -name [ matches a file literally named [', async () => {
	await harness.setTextFile('/work/[', '');

	const result = await harness.runWithStatus("find /work -name '['");
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/[');
});

// name-slash: -name with '/' in pattern should match nothing (basenames only).
test('gnu find: name-slash.sh - -name with slash in pattern matches nothing', async () => {
	await harness.setTextFile('/work/dir/file', '');

	const result = await harness.runWithStatus("find /work -name 'dir/file'");
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

// Adapted from name-slash.sh to cover the SHFS subset's explicit -path support.
test('gnu find: name-slash.sh - -path matches the full path rather than the basename', async () => {
	await harness.setTextFile('/work/dir/file', '');

	const result = await harness.runWithStderr(
		"find /work -path '/work/dir/file'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('/work/dir/file');
});

test('gnu find: name-slash.sh - -name / matches the root directory basename', async () => {
	const result = await harness.runWithStatus("find / -maxdepth 0 -name '/'");
	expect(result.status).toBe(0);
	expect(result.output).toBe('/');
});
