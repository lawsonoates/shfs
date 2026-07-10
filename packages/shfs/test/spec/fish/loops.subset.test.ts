// Translated/adapted from fish-shell tests/checks/loops.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/loops.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream counts iterations with `math` and `seq`; this port shrinks
// lists with slices instead. The `--no-execute` and `--help` cases are out of
// scope.

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

async function runResult(command: string) {
	const result = await shell.$`${command}`.nothrow();
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.text(),
	};
}

// loops.fish: function never_runs; while false; end; end
test('fish loops: loops.fish - empty while loop in function returns 0', async () => {
	const script = [
		'function never_runs',
		'    while false',
		'    end',
		'end',
		'never_runs',
		'echo "Empty Loop in Function: $status"',
	].join('\n');
	expect(await run(script)).toBe('Empty Loop in Function: 0');
});

// loops.fish: function early_return; while true; return 2; end; end
test('fish loops: loops.fish - return exits a while loop with its status', async () => {
	const script = [
		'function early_return',
		'    while true',
		'        return 2',
		'    end',
		'end',
		'early_return',
		'echo "Early Return: $status"',
	].join('\n');
	expect(await run(script)).toBe('Early Return: 2');
});

// loops.fish: the previous status is visible in the loop condition.
test('fish loops: loops.fish - incoming status is visible in the while condition', async () => {
	const script = [
		'function set_status',
		'    return $argv[1]',
		'end',
		'set_status 36',
		'while begin',
		'        set -l saved $status',
		'        echo "Condition Status: $saved"',
		'        set_status $saved',
		'    end',
		'    true',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Condition Status: 36');
});

// loops.fish: the condition status IS visible in the loop body.
test('fish loops: loops.fish - loop body sees the condition status', async () => {
	const script = [
		'function set_status',
		'    return $argv[1]',
		'end',
		'set_status 55',
		'while true',
		'    echo "Body Status: $status"',
		'    break',
		'end',
	].join('\n');
	expect(await run(script)).toBe('Body Status: 0');
});

// loops.fish: the status of the last body command is visible in the condition.
// (The loop exits with the last body status, 5.)
test('fish loops: loops.fish - condition sees the last body status', async () => {
	const script = [
		'function set_status',
		'    return $argv[1]',
		'end',
		'set_status 13',
		'while begin',
		'        set -l saved $status',
		'        echo "Condition 2 Status: $saved"',
		'        test $saved -ne 5',
		'    end',
		'    set_status 5',
		'end',
	].join('\n');
	const result = await runResult(script);
	expect(result.stdout).toBe('Condition 2 Status: 13\nCondition 2 Status: 5');
	expect(result.exitCode).toBe(5);
});

// loops.fish: the status of the last command is visible outside the loop.
test('fish loops: loops.fish - while loop exit status is the last body status', async () => {
	const script = [
		'function set_status',
		'    return $argv[1]',
		'end',
		'set rem 5 7 11',
		'while [ (count $rem) -gt 0 ]',
		'    set_status $rem[1]',
		'    set rem $rem[2..-1]',
		'end',
		'echo "Loop Exit Status: $status"',
	].join('\n');
	expect(await run(script)).toBe('Loop Exit Status: 11');
});

// loops.fish: empty loops succeed.
test('fish loops: loops.fish - a while loop that never runs has status 0', async () => {
	expect(
		await run('false\nwhile false\nend\necho "Empty Loop Status: $status"')
	).toBe('Empty Loop Status: 0');
});

// loops.fish: loop control in conditions, should have no output.
test('fish loops: loops.fish - break in a while condition breaks the outer loop', async () => {
	const script = [
		'for i in 1 2 3',
		'    while break',
		'    end',
		'    echo $i',
		'end',
	].join('\n');
	expect(await run(script)).toBe('');
});

test('fish loops: loops.fish - continue in a while condition continues the outer loop', async () => {
	const script = [
		'for i in 1 2 3',
		'    while continue',
		'    end',
		'    echo $i',
		'end',
	].join('\n');
	expect(await run(script)).toBe('');
});

// loops.fish: for loops with read-only vars is an error (#4342)
test('fish loops: loops.fish - read-only loop variable is an error', async () => {
	const result = await runResult(
		'for status in a b c\n    echo $status\nend'
	);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		'for: status: cannot overwrite read-only variable'
	);
});
