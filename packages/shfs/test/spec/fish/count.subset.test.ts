// Translated/adapted from fish-shell tests/checks/count.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/count.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Reductions: upstream generates large argument lists with `seq` and builds
// stdin with `printf`/`echo -n`, all outside the shfs subset. Command
// substitution and plain `echo` reproduce the same contracts.

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

async function runStatus(
	command: string
): Promise<{ exitCode: number; stdout: string }> {
	const result = await shell.$`${command}`.nothrow();
	return { exitCode: result.exitCode, stdout: result.text() };
}

// count.fish:4-6: count with no arguments prints 0.
test('fish count: count.fish - no arguments prints 0 and fails', async () => {
	const { exitCode, stdout } = await runStatus('count');
	expect(stdout).toBe('0');
	expect(exitCode).toBe(1);
});

// count.fish:8-14: one and two arguments.
test('fish count: count.fish - counts plain arguments', async () => {
	expect(await run('count x')).toBe('1');
	expect(await run('count x y')).toBe('2');
});

// count.fish:16-26: args that look like flags or are otherwise special are
// counted, never parsed as options.
test('fish count: count.fish - flag-like arguments are counted literally', async () => {
	expect(await run('count -h')).toBe('1');
	expect(await run('count --help')).toBe('1');
	expect(await run('count --')).toBe('1');
	expect(await run('count -- abc')).toBe('2');
	expect(await run('count def -- abc')).toBe('3');
});

// count.fish:30-38: counting a command substitution's split output.
// Reduced from `count (seq 1 10000)`: `seq` is out of scope; substitution
// line-splitting is the in-scope contract.
test('fish count: count.fish - counts command substitution results', async () => {
	expect(await run('count (echo 1; echo 2; echo 3)')).toBe('3');
});

// count.fish:40-43: reading from stdin still counts the arguments; stdin
// lines are added to the argument count. Reduced from
// `printf '%s\n' 1 2 3 4 5 | count 6 7 8 9 10` (printf is out of scope).
test('fish count: count.fish - stdin lines add to the argument count', async () => {
	expect(await run('echo x | count 6 7 8 9 10')).toBe('6');
});

// count.fish:45-50: reading from stdin counts newline-terminated records.
test('fish count: count.fish - counts stdin records like wc -l', async () => {
	const empty = await runStatus('echo -n 0 | count');
	expect(empty.stdout).toBe('0');
	expect(empty.exitCode).toBe(1);
	expect(await run('echo 1 | count')).toBe('1');

	// Adapt the same newline-counting contract to echo's exact-byte output.
	const unterminatedBytes = await runStatus("echo -ne '\\141' | count");
	expect(unterminatedBytes.stdout).toBe('0');
	expect(unterminatedBytes.exitCode).toBe(1);
	expect(await run("echo -ne '\\141\\nb' | count")).toBe('1');
	expect(await run("echo -ne '\\141\\n\\nb' | count")).toBe('2');
});
