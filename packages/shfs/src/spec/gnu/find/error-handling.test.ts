// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/opt-numeric-arg.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/refuse-noop.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

// opt-numeric-arg: adapt the upstream numeric-argument diagnostics to the
// in-scope traversal controls.
test('opt-numeric-arg (adapted): -maxdepth without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -maxdepth');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg (adapted): -maxdepth with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -maxdepth foo');
	expect(result.status).toBe(1);
	expect(result.output).toContain('non-numeric argument');
});

test('opt-numeric-arg (adapted): -mindepth without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -mindepth');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg (adapted): -mindepth with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -mindepth foo');
	expect(result.status).toBe(1);
	expect(result.output).toContain('non-numeric argument');
});

// refuse-noop: Verify that find refuses the internal -noop / ---noop option.
// Between findutils-4.3.1 and 4.6, find dumped core.
// See Savannah bug #48180.
test('refuse-noop: find -noop is rejected as unknown predicate', async () => {
	const result = await harness.runWithStderr('find -noop');
	expect(result.status).toBe(1);
	expect(result.output).toContain('unknown predicate');
	expect(result.output).toContain('-noop');
});

test('refuse-noop: find ---noop is rejected as unknown predicate', async () => {
	const result = await harness.runWithStderr('find ---noop');
	expect(result.status).toBe(1);
	expect(result.output).toContain('unknown predicate');
	expect(result.output).toContain('---noop');
});
