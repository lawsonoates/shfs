// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.gnu/sv-bug-17490.exp
// Copyright (C) 2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.
//
// Adaptation note:
// GNU's original case verifies that placing -regex as the final argument
// does not crash. This test keeps that regression intent and asserts a
// clean, non-matching result.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../../../harness';

const harness = Harness.create();

test('gnu find: sv-bug-17490.exp - final -regex argument does not crash', async () => {
	const result = await harness.runWithStatus("find . -maxdepth 0 -regex 'x'");

	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});
