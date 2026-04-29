// Translated/adapted from GNU coreutils tests/fold/fold-characters.sh and
// tests/fold/fold-zero-width.sh wc -L locale guards.
// Copyright (C) 2025-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createWcHarness } from './harness';

const harness = createWcHarness();
const INPUT_PATH = '/display-width-input';

test('fold-characters.sh adapted: wc -L counts wide characters by display columns', async () => {
	await harness.setTextFile(INPUT_PATH, '\uB250\uFF1A');

	expect(await harness.run(`wc -L < ${INPUT_PATH}`)).toBe('4');
});

test('fold-zero-width.sh adapted: wc -L ignores zero-width characters', async () => {
	await harness.setTextFile(INPUT_PATH, '\u200B');

	expect(await harness.run(`wc -L < ${INPUT_PATH}`)).toBe('0');
});
