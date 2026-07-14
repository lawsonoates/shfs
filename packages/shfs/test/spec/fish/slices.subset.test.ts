// Translated/adapted from fish-shell tests/checks/slices.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/slices.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream builds lists with `seq`; this port writes them out literally.
// Variable and command-substitution bounds use their upstream spelling.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

const SET_TEST_LIST = 'set n 10\nset test 1 2 3 4 5 6 7 8 9 10';

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runResult(command: string) {
	const result = await shell.$`${command}`.nothrow();
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.text(),
	};
}

// slices.fish: echo $test[1..$n] # normal range
test('fish slices: slices.fish - normal range with variable bound', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[1..$n]`)).toBe(
		'1 2 3 4 5 6 7 8 9 10'
	);
});

// slices.fish: echo $test[1 .. 2] # spaces are allowed
test('fish slices: slices.fish - spaces are allowed inside the brackets', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[1 .. 2]`)).toBe('1 2');
});

// slices.fish: echo $test[$n..1] # inverted range
test('fish slices: slices.fish - inverted range reverses the elements', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[$n..1]`)).toBe(
		'10 9 8 7 6 5 4 3 2 1'
	);
});

// slices.fish: echo $test[2..5 8..6] # several ranges
test('fish slices: slices.fish - several ranges concatenate', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[2..5 8..6]`)).toBe(
		'2 3 4 5 8 7 6'
	);
});

// slices.fish: echo $test[-1..-2] # range with negative limits
test('fish slices: slices.fish - negative range selects from the end', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[-1..-2]`)).toBe('10 9');
});

// slices.fish: echo $test[-1..1] # range with mixed limits
test('fish slices: slices.fish - mixed negative-to-positive range reverses everything', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[-1..1]`)).toBe(
		'10 9 8 7 6 5 4 3 2 1'
	);
});

// slices.fish: set test1[-1..1] $test
test('fish slices: slices.fish - slice assignment with inverted target range', async () => {
	const script = [
		SET_TEST_LIST,
		'set test1 $test',
		'set test1[-1..1] $test',
		'echo $test1',
	].join('\n');
	expect(await run(script)).toBe('10 9 8 7 6 5 4 3 2 1');
});

// slices.fish: set test1[1..$n] $test
test('fish slices: slices.fish - slice assignment with normal range', async () => {
	const script = [
		SET_TEST_LIST,
		'set test1 $test',
		'set test1[-1..1] $test',
		'set test1[1..$n] $test',
		'echo $test1',
	].join('\n');
	expect(await run(script)).toBe('1 2 3 4 5 6 7 8 9 10');
});

// slices.fish: set test1[$n..1] $test
test('fish slices: slices.fish - slice assignment with variable inverted range', async () => {
	const script = [
		SET_TEST_LIST,
		'set test1 $test',
		'set test1[$n..1] $test',
		'echo $test1',
	].join('\n');
	expect(await run(script)).toBe('10 9 8 7 6 5 4 3 2 1');
});

// slices.fish: set test1[2..4 -2..-4] $test1[4..2 -4..-2]
test('fish slices: slices.fish - swap slices across multiple ranges', async () => {
	const script = [
		SET_TEST_LIST,
		'set test1 $test',
		'set test1[$n..1] $test',
		'set test1[2..4 -2..-4] $test1[4..2 -4..-2]',
		'echo $test1',
	].join('\n');
	expect(await run(script)).toBe('10 7 8 9 6 5 2 3 4 1');
});

// slices.fish: echo (seq 5)[-1..1]
// Adapted: a function producing one line per value replaces seq.
test('fish slices: slices.fish - command substitution output can be sliced', async () => {
	const script = [
		'function five',
		'    echo 1',
		'    echo 2',
		'    echo 3',
		'    echo 4',
		'    echo 5',
		'end',
		'echo (five)[-1..1]',
	].join('\n');
	expect(await run(script)).toBe('5 4 3 2 1');
});

test('fish slices: slices.fish - command substitution single index', async () => {
	const script = [
		'function five',
		'    echo 1',
		'    echo 2',
		'    echo 3',
		'    echo 4',
		'    echo 5',
		'end',
		'echo (five)[2]',
	].join('\n');
	expect(await run(script)).toBe('2');
});

// slices.fish: echo $test[(count $test)..1]
test('fish slices: slices.fish - command substitution supplies an inverted range bound', async () => {
	expect(
		await run(`${SET_TEST_LIST}\necho $test[(count $test)..1]`)
	).toBe('10 9 8 7 6 5 4 3 2 1');
});

// slices.fish: echo $test[1..(count $test)]
test('fish slices: slices.fish - command substitution supplies a range end', async () => {
	expect(
		await run(`${SET_TEST_LIST}\necho $test[1..(count $test)]`)
	).toBe('1 2 3 4 5 6 7 8 9 10');
});

// slices.fish: echo $test[ .. ]
test('fish slices: slices.fish - fully open range selects everything', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[ .. ]`)).toBe(
		'1 2 3 4 5 6 7 8 9 10'
	);
});

// slices.fish: echo $test[ ..3]
test('fish slices: slices.fish - open start range', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[ ..3]`)).toBe('1 2 3');
});

// slices.fish: echo $test[8.. ]
test('fish slices: slices.fish - open end range', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[8.. ]`)).toBe('8 9 10');
});

// slices.fish: echo $test[..2 5]
test('fish slices: slices.fish - open range mixed with a single index', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[..2 5]`)).toBe('1 2 5');
});

// slices.fish: echo $test[2 9..]
test('fish slices: slices.fish - single index mixed with an open range', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[2 9..]`)).toBe('2 9 10');
});

// slices.fish: echo $test[1..2..] → Invalid index value
test('fish slices: slices.fish - double range is an invalid index', async () => {
	const result = await runResult(`${SET_TEST_LIST}\necho $test[1..2..]`);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('Invalid index value');
});

// slices.fish: echo $test[..1..2] → Invalid index value
test('fish slices: slices.fish - double range with open start is an invalid index', async () => {
	const result = await runResult(`${SET_TEST_LIST}\necho $test[..1..2]`);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('Invalid index value');
});

// slices.fish: empty variable bounds differ by quoting and position.
test('fish slices: slices.fish - empty variable bounds preserve open-range semantics', async () => {
	const setup = `${SET_TEST_LIST}\nset -l empty`;
	expect(await run(`${setup}\necho $test[$empty..]`)).toBe('');
	expect(await run(`${setup}\necho $test[.."$empty"]`)).toBe(
		'1 2 3 4 5 6 7 8 9 10'
	);
	expect(await run(`${setup}\necho $test["$empty"..]`)).toBe(
		'1 2 3 4 5 6 7 8 9 10'
	);
});

// slices.fish: an empty command substitution contributes no bound values.
test('fish slices: slices.fish - empty command substitution bound selects nothing', async () => {
	expect(await run(`${SET_TEST_LIST}\necho $test[(true)..3]`)).toBe('');
});

// slices.fish: set list[..2] $list[2..1]
test('fish slices: slices.fish - open range slice assignment', async () => {
	const script = [
		'set -l list 1 2 3',
		'set list[..2] $list[2..1]',
		'echo $list',
	].join('\n');
	expect(await run(script)).toBe('2 1 3');
});

// slices.fish: set list[2..] $list[-1..2]
test('fish slices: slices.fish - open end slice assignment', async () => {
	const script = [
		'set -l list 1 2 3',
		'set list[2..] $list[-1..2]',
		'echo $list',
	].join('\n');
	expect(await run(script)).toBe('1 3 2');
});
