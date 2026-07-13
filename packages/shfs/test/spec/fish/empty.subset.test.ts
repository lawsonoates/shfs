// Translated/adapted from fish-shell tests/checks/empty.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/empty.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Upstream issue 5692: calling a function must not preserve the caller's
// $status, while begin/end blocks must preserve it.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// empty.fish:5-12: an empty function resets a failing $status to 0.
test('fish empty: empty.fish - empty function does not preserve failing status', async () => {
	const script = [
		'function empty',
		'end',
		'false',
		'empty',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('0');
});

// empty.fish:13-16: an empty function keeps a successful $status at 0.
test('fish empty: empty.fish - empty function returns 0 after success', async () => {
	const script = [
		'function empty',
		'end',
		'true',
		'empty',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('0');
});

// Fish only substitutes status 0 when the function executed nothing
// (src/exec.rs get_performer_for_function); a non-empty body still sees the
// caller's $status at entry.
test('fish empty: empty.fish - non-empty function body sees the caller status', async () => {
	const script = [
		'function shows_status',
		'    echo in:$status',
		'end',
		'false',
		'shows_status',
		'echo after:$status',
	].join('\n');
	expect(await run(script)).toBe('in:1\nafter:0');
});

// empty.fish:19-23: an empty begin/end block preserves a failing $status.
test('fish empty: empty.fish - empty block preserves failing status', async () => {
	expect(await run('false\nbegin\nend\necho $status')).toBe('1');
});

// empty.fish:24-28: an empty begin/end block preserves a successful $status.
test('fish empty: empty.fish - empty block preserves successful status', async () => {
	expect(await run('true\nbegin\nend\necho $status')).toBe('0');
});
