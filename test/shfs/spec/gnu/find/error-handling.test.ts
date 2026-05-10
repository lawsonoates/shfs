// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/opt-numeric-arg.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/refuse-noop.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../harness';

const harness = Harness.create();

// opt-numeric-arg: adapt the upstream numeric-argument diagnostics to the
// in-scope traversal controls.
test('gnu find: opt-numeric-arg.sh - -maxdepth without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -maxdepth');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('missing argument');
});

test('gnu find: opt-numeric-arg.sh - -maxdepth with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -maxdepth foo');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('non-numeric argument');
});

test('gnu find: opt-numeric-arg.sh - -mindepth without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -mindepth');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('missing argument');
});

test('gnu find: opt-numeric-arg.sh - -mindepth with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -mindepth foo');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('non-numeric argument');
});

// refuse-noop: Verify that find refuses the internal -noop / ---noop option.
// Between findutils-4.3.1 and 4.6, find dumped core.
// See Savannah bug #48180.
test('gnu find: refuse-noop.sh - find -noop is rejected as unknown predicate', async () => {
	const result = await harness.runWithStderr('find -noop');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('unknown predicate');
	expect(result.stderr).toContain('-noop');
});

test('gnu find: refuse-noop.sh - find ---noop is rejected as unknown predicate', async () => {
	const result = await harness.runWithStderr('find ---noop');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('unknown predicate');
	expect(result.stderr).toContain('---noop');
});
