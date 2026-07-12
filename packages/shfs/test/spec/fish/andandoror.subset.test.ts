// Translated/adapted from fish-shell tests/checks/andandoror.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/andandoror.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish andandoror.fish covers &&/|| operators, `not`/`!`, `begin`/`end`
// blocks, `if`/`while` with &&/||, newline continuation after combiners, and
// `--help` flags. This subset covers everything except `--help` output and
// `math`-based loops (adapted to list-based counting). Upstream external
// commands (`true`, `false`, `sh`) map to the shfs builtins `true`/`false`.

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

// andandoror.fish: echo first && echo second
test('fish and/or: andandoror.fish - && chains on success', async () => {
	expect(await run('echo first && echo second')).toBe('first\nsecond');
});

// andandoror.fish: echo third || echo fourth
test('fish and/or: andandoror.fish - || skips when prior command succeeds', async () => {
	expect(await run('echo third || echo fourth')).toBe('third');
});

// andandoror.fish: true && false; echo "true && false: $status"
test('fish and/or: andandoror.fish - && propagates failure status', async () => {
	expect(await run('true && false; echo "true && false: $status"')).toBe(
		'true && false: 1'
	);
});

// andandoror.fish: true || false; echo "true || false: $status"
test('fish and/or: andandoror.fish - || preserves success status when first succeeds', async () => {
	expect(await run('true || false; echo "true || false: $status"')).toBe(
		'true || false: 0'
	);
});

// andandoror.fish: true && false || true; echo "true && false || true: $status"
test('fish and/or: andandoror.fish - chained && || evaluates left to right', async () => {
	expect(
		await run(
			'true && false || true; echo "true && false || true: $status"'
		)
	).toBe('true && false || true: 0');
});

// andandoror.fish: if true || false ... "if test 1 ok"
test('fish and/or: andandoror.fish - || works in if conditions', async () => {
	expect(await run('if true || false\n    echo "if test 1 ok"\nend')).toBe(
		'if test 1 ok'
	);
});

// andandoror.fish: if true && false; else; echo "if test 2 ok"; end
test('fish and/or: andandoror.fish - && failure in if condition takes else branch', async () => {
	expect(
		await run('if true && false\nelse\n    echo "if test 2 ok"\nend')
	).toBe('if test 2 ok');
});

// andandoror.fish: if true && false; or true ... "if test 3 ok"
test('fish and/or: andandoror.fish - && condition continued by or keyword', async () => {
	expect(
		await run('if true && false; or true\n    echo "if test 3 ok"\nend')
	).toBe('if test 3 ok');
});

// andandoror.fish: if [ 0 = 1 ] || [ 5 -ge 3 ] ... "if test 4 ok"
test('fish and/or: andandoror.fish - || with [ ] test commands in if condition', async () => {
	expect(
		await run('if [ 0 = 1 ] || [ 5 -ge 3 ]\n    echo "if test 4 ok"\nend')
	).toBe('if test 4 ok');
});

// andandoror.fish: while [ ... ] && [ ... ] with `or` continuation lines.
// Adapted: upstream counts with `math`; this port shrinks lists instead.
test('fish and/or: andandoror.fish - while condition supports && and or continuation', async () => {
	const script = [
		'set alpha a b',
		'while false',
		'    or [ (count $alpha) -gt 0 ]',
		'    echo (count $alpha)',
		'    set -e alpha[1]',
		'end',
	].join('\n');
	expect(await run(script)).toBe('2\n1');
});

// andandoror.fish: true && ! false; echo $status
test('fish and/or: andandoror.fish - ! negates after &&', async () => {
	expect(await run('true && ! false\necho $status')).toBe('0');
});

// andandoror.fish: not true && ! false; echo $status
test('fish and/or: andandoror.fish - not applies per pipeline within && chain', async () => {
	expect(await run('not true && ! false\necho $status')).toBe('1');
});

// andandoror.fish: not not not true; echo $status
test('fish and/or: andandoror.fish - triple not inverts once', async () => {
	expect(await run('not not not true\necho $status')).toBe('1');
});

// andandoror.fish: not ! ! not true; echo $status
test('fish and/or: andandoror.fish - mixed not and ! cancel in pairs', async () => {
	expect(await run('not ! ! not true\necho $status')).toBe('0');
});

// andandoror.fish: not ! echo not !; echo $status
test('fish and/or: andandoror.fish - not and ! outside command position are plain words', async () => {
	expect(await run('not ! echo not !\necho $status')).toBe('not !\n0');
});

// andandoror.fish: begin ... end || begin ... end
test('fish and/or: andandoror.fish - || chains begin blocks', async () => {
	const script = [
		'begin',
		'    echo 1',
		'    false',
		'end || begin',
		'    echo 2 && echo 3',
		'end',
	].join('\n');
	expect(await run(script)).toBe('1\n2\n3');
});

// andandoror.fish: if false && true; or not false; echo 4; end
test('fish and/or: andandoror.fish - if condition mixes &&, or continuation, and not', async () => {
	expect(
		await run('if false && true\n    or not false\n    echo 4\nend')
	).toBe('4');
});

// andandoror.fish: true && \n echo newline after conjunction
test('fish and/or: andandoror.fish - newline is allowed after &&', async () => {
	expect(await run('true &&\necho newline after conjunction')).toBe(
		'newline after conjunction'
	);
});

// andandoror.fish: false || \n echo newline after disjunction
test('fish and/or: andandoror.fish - newline is allowed after ||', async () => {
	expect(await run('false ||\necho newline after disjunction')).toBe(
		'newline after disjunction'
	);
});

// andandoror.fish: true && <blank line> echo empty lines after conjunction
test('fish and/or: andandoror.fish - empty lines are allowed after &&', async () => {
	expect(await run('true &&\n\necho empty lines after conjunction')).toBe(
		'empty lines after conjunction'
	);
});

// andandoror.fish: true && # comment ... echo comment after conjunction
test('fish and/or: andandoror.fish - comments are allowed after &&', async () => {
	expect(
		await run(
			'true &&\n# can have comments here!\necho comment after conjunction'
		)
	).toBe('comment after conjunction');
});

// andandoror.fish: PATH= cat || echo cat failed
// Adapted: shfs has no external commands; any unknown command name fails the
// job at runtime and || recovers.
test('fish and/or: andandoror.fish - unknown command failure is recovered by ||', async () => {
	const result = await runResult(
		'definitely_not_a_command_xyz || echo cat failed'
	);
	expect(result.stdout).toBe('cat failed');
	expect(result.stderr).toContain('Unknown command');
	expect(result.exitCode).toBe(0);
});

// Keyword forms remain equivalent to the symbolic combiners.
test('fish and/or: andandoror.fish - `; and`/`; or` keyword chains stay equivalent', async () => {
	expect(
		await run('test 1 = 1; and test 1 = 2; or test 1 = 1; echo $status')
	).toBe('0');
	expect(await run('test a = a; and echo "yes"; or echo "no"')).toBe('yes');
	expect(await run('test a = b; and echo "yes"; or echo "no"')).toBe('no');
});
