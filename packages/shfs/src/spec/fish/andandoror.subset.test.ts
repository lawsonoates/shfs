// Translated/adapted from fish-shell tests/checks/andandoror.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/andandoror.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish andandoror.fish covers &&/|| operators, `not`/`!`, `begin`/`end`
// blocks, `if`/`while` with &&/||, and `--help` flags. shfs supports `and`/`or`
// keyword chaining and $status but not &&/|| operators, `not`/`!`, `begin`/`end`,
// `if`/`while`, or `--help`. This subset covers the `and`/`or` keyword behavior
// and $status propagation within the shfs boundary.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// andandoror.fish: echo first && echo second
// Adapted: shfs uses `and`/`or` keywords instead of &&/||.
test('andandoror subset: and chains on success', async () => {
	expect(await run('echo first; and echo second')).toBe('first\nsecond');
});

// andandoror.fish: echo third || echo fourth
// Adapted: `or` after a successful command does not run.
test('andandoror subset: or skips when prior command succeeds', async () => {
	expect(await run('echo third; or echo fourth')).toBe('third');
});

// andandoror.fish: true && false; echo "true && false: $status"
// Adapted: test 1 = 1 succeeds (status 0), then test 1 = 2 fails (status 1).
test('andandoror subset: and propagates failure status', async () => {
	expect(await run('test 1 = 1; and test 1 = 2; echo $status')).toBe('1');
});

// andandoror.fish: true || false; echo "true || false: $status"
// Adapted: first command succeeds, or is skipped, status remains 0.
test('andandoror subset: or preserves success status when first succeeds', async () => {
	expect(await run('test 1 = 1; or test 1 = 2; echo $status')).toBe('0');
});

// andandoror.fish: true && false || true; echo "true && false || true: $status"
// Adapted: success → and runs → failure → or runs → success.
test('andandoror subset: chained and/or evaluates left to right', async () => {
	expect(
		await run('test 1 = 1; and test 1 = 2; or test 1 = 1; echo $status')
	).toBe('0');
});

// Verify that `and` skips when prior command fails.
test('andandoror subset: and skips when prior command fails', async () => {
	expect(await run('test 1 = 2; and echo should-not-run; echo done')).toBe(
		'done'
	);
});

// Verify that `or` runs when prior command fails.
test('andandoror subset: or runs when prior command fails', async () => {
	expect(await run('test 1 = 2; or echo recovered')).toBe('recovered');
});

// Multiple and/or in sequence.
test('andandoror subset: multiple and chains all require success', async () => {
	expect(await run('test 1 = 1; and test a = a; and echo "all passed"')).toBe(
		'all passed'
	);
});

test('andandoror subset: and chain breaks on first failure', async () => {
	expect(
		await run(
			'test 1 = 1; and test 1 = 2; and echo "should not run"; or echo "recovered"'
		)
	).toBe('recovered');
});

// or after or.
test('andandoror subset: or chain tries alternatives until one succeeds', async () => {
	expect(await run('test 1 = 2; or test 1 = 3; or echo "fallback"')).toBe(
		'fallback'
	);
});

// and/or with echo (echo always succeeds).
test('andandoror subset: echo sets status 0 for subsequent and/or', async () => {
	expect(await run('echo start; and echo "and ran"')).toBe('start\nand ran');
	expect(await run('echo start; or echo "or ran"')).toBe('start');
});

// and/or interacts correctly with set.
test('andandoror subset: set success feeds into and/or chain', async () => {
	expect(
		await run('set -g x 1; and echo "set passed"; or echo "set failed"')
	).toBe('set passed');
});

// $status is updated by each command in the chain.
test('andandoror subset: $status reflects the last executed command', async () => {
	// test 1 = 2 fails (status 1), and is skipped, or runs test 1 = 1 (status 0).
	await run('test 1 = 2; and echo skip; or test 1 = 1');
	expect(await run('echo $status')).toBe('0');
});

// and/or at the start of a semicolon-separated script.
test('andandoror subset: and/or work across semicolon-separated statements', async () => {
	expect(await run('test a = a; and echo "yes"; or echo "no"')).toBe('yes');
	expect(await run('test a = b; and echo "yes"; or echo "no"')).toBe('no');
});

// andandoror.fish: not/! are out of scope for shfs.
test('andandoror subset: not and ! are out of scope', async () => {
	await expect(run('not test 1 = 1')).rejects.toThrow('Unknown command: not');
	await expect(run('! test 1 = 1')).rejects.toThrow();
});

// andandoror.fish: begin/end blocks are out of scope for shfs.
test('andandoror subset: begin/end blocks are out of scope', async () => {
	await expect(run('begin; echo 1; end')).rejects.toThrow(
		'Unknown command: begin'
	);
});
