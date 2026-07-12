// Translated/adapted from fish-shell tests/checks/exit-status-with-closing-stderr.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/exit-status-with-closing-stderr.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Reductions: upstream produces the failing status with `argparse` (out of
// scope); a failing in-scope command stands in. The preserved contract is
// that discarding or closing stderr does not clobber the command's status.

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

// exit-status-with-closing-stderr.fish:2-4: status survives a stderr
// redirect to the null device.
test('fish exit-status-with-closing-stderr: exit-status-with-closing-stderr.fish - status preserved with 2>/dev/null', async () => {
	expect(await run('cat /missing 2> /dev/null; echo $status')).toBe('1');
});

// exit-status-with-closing-stderr.fish:5-7: status survives closing stderr.
test('fish exit-status-with-closing-stderr: exit-status-with-closing-stderr.fish - status preserved with 2>&-', async () => {
	expect(await run('cat /missing 2>&-; echo $status')).toBe('1');
});
