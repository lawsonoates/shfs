// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/debug-missing-arg.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/opt-numeric-arg.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/refuse-noop.sh
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/operators-wrong-with-dash.sh
// Copyright (C) 2016-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

// debug-missing-arg: Verify that 'find -D' without further argument outputs
// an error diagnostic.
// Between FINDUTILS_4_3_1-1 and 4.6, find crashed on some platforms.
// See Savannah bug #52220.
test('debug-missing-arg: find -D without argument produces an error', async () => {
	const result = await harness.runWithStderr('find -D');
	expect(result.status).toBe(1);
	expect(result.output).toContain('Missing argument after the -D option');
});

// opt-numeric-arg: Error diagnostics for options with mandatory numeric args.
test('opt-numeric-arg: -inum without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -inum');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg: -inum with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -inum foo');
	expect(result.status).toBe(1);
	expect(result.output).toContain('non-numeric argument');
});

test('opt-numeric-arg: -links without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -links');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg: -links with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -links foo');
	expect(result.status).toBe(1);
	expect(result.output).toContain('non-numeric argument');
});

test('opt-numeric-arg: -uid without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -uid');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg: -uid with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -uid foo');
	expect(result.status).toBe(1);
	expect(result.output).toContain('non-numeric argument');
});

test('opt-numeric-arg: -gid without argument reports missing argument', async () => {
	const result = await harness.runWithStderr('find -gid');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

test('opt-numeric-arg: -gid with non-numeric argument reports error', async () => {
	const result = await harness.runWithStderr('find -gid foo');
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

// operators-wrong-with-dash: Verify warnings for deprecated operator syntax
// with a leading dash: -!, -(, -), -,
// Findutils 4.11 issues a warning for these forms.
test('operators-wrong-with-dash: -( with leading dash emits deprecation warning', async () => {
	const result = await harness.runWithStderr(
		"find '-(' -not -type c '-)'"
	);
	expect(result.status).toBe(0);
	expect(result.output).toContain("operator '-(");
	expect(result.output).toContain('will no longer be accepted');
});

test('operators-wrong-with-dash: -! with leading dash emits deprecation warning', async () => {
	const result = await harness.runWithStderr(
		"find '-!' -type f"
	);
	expect(result.status).toBe(0);
	expect(result.output).toContain("operator '-!");
	expect(result.output).toContain('will no longer be accepted');
});

test('operators-wrong-with-dash: all dashed operators warn together', async () => {
	const result = await harness.runWithStderr(
		"find '-(' '-!' -not -type c ',-' -type b '-)'"
	);
	expect(result.status).toBe(0);
	// Expect warnings for each dashed operator used.
	expect(result.output).toContain("'-(");
	expect(result.output).toContain("'-!");
	expect(result.output).toContain("'-)");
});
