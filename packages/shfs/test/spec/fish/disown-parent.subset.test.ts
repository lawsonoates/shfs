// Translated/adapted from fish-shell tests/checks/disown-parent.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/disown-parent.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// The external helper and job-control command are outside the shfs subset. The
// port retains the upstream pipeline-to-function-to-read contract.

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

// disown-parent.fish:8-13: helper | disowner, where disowner calls read.
test('fish disown-parent: disown-parent.fish - functions inherit pipeline stdin', async () => {
	const script = [
		'function consume',
		'    read value',
		'    echo $value',
		'end',
		'echo pipeline | consume',
	].join('\n');

	expect(await run(script)).toBe('pipeline');
});
