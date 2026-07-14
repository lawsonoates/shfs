// Translated/adapted from fish-shell tests/checks/line-continuation.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/line-continuation.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// In-scope contract: a backslash-newline continues the line, including in the
// middle of a command name. The `builtin` command is out of scope (the split
// command-name case is reduced to `count`), as are quoted words acting as
// keywords (line-continuation.fish:23-27).

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

// line-continuation.fish:2-4: continuation splits a command name.
test('fish line-continuation: line-continuation.fish - continuation inside command name', async () => {
	expect(await run('ech\\\no echo')).toBe('echo');
});

// line-continuation.fish:6-8: continuation inside a longer command name.
// Reduced from `buil\tin echo` (the builtin command is out of scope).
test('fish line-continuation: line-continuation.fish - continuation inside another command name', async () => {
	expect(await run('cou\\\nnt x')).toBe('1');
});

// line-continuation.fish:10-12: continuation splits the `and` combiner.
test('fish line-continuation: line-continuation.fish - continuation inside a combiner keyword', async () => {
	expect(await run('true; an\\\nd echo true')).toBe('true');
});

// line-continuation.fish: \i\ + \U00000066\ and \145n\ + d\ spell the
// opening and closing keywords across continued physical lines.
test('fish line-continuation: line-continuation.fish - escapes and continuations spell control-flow keywords', async () => {
	const script = [
		'\\i\\',
		'\\U00000066\\',
		' true',
		'    echo if true',
		'\\145n\\',
		'd\\',
	].join('\n');
	expect(await run(script)).toBe('if true');
});
