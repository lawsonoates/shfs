// Translated/adapted from fish-shell tests/checks/wildcard.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/wildcard.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Reductions: upstream builds its tree with mktemp/chmod; the virtual
// filesystem stands in. The permission-denied traversal case
// (wildcard.fish:17-25) is out of scope (no permission model). Fish's exact
// no-match message and status 124 are out of scope; shfs reports its own
// deterministic error.

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

// wildcard.fish:3-13: when variable expansion yields multiple strings and one
// of them fails its glob, the matching string still expands. Reduced to
// absolute paths: fish echoes `./b/file.txt` for `./b`, while shfs normalizes
// away the `./` prefix in glob results.
test('fish wildcard: wildcard.fish - one failing glob does not fail the whole expansion', async () => {
	const script = [
		'mkdir /a /b',
		'touch /b/file.txt',
		'set dirs /a /b',
		'echo $dirs/*.txt',
	].join('\n');
	expect(await run(script)).toBe('/b/file.txt');
});

// wildcard.fish:6-9: a glob with no matches at all is an error that produces
// no output. Fish reports status 124 with a caret diagnostic; shfs uses its
// deterministic error model with a nonzero status.
test('fish wildcard: wildcard.fish - fully unmatched glob fails with no output', async () => {
	const result = await shell.$`mkdir /a; cd /; echo */foo/`.nothrow();
	expect(result.text()).toBe('');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr.toString()).toContain('no matches');
});
