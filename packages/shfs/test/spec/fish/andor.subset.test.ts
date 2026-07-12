// Translated/adapted from fish-shell tests/checks/andor.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/andor.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream wraps the pipeline-misuse cases in `eval` so the script can
// keep running; shfs reports them as deterministic script failures instead.

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

// andor.fish: eval 'true | and'
test('fish andor: andor.fish - and cannot be used in a pipeline', async () => {
	const result = await runResult('true | and');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"The 'and' command can not be used in a pipeline"
	);
});

// andor.fish: eval 'true | or'
test('fish andor: andor.fish - or cannot be used in a pipeline', async () => {
	const result = await runResult('true | or');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"The 'or' command can not be used in a pipeline"
	);
});

// andor.fish: if false; or true; echo success1; end
test('fish andor: andor.fish - or continuation in if condition', async () => {
	expect(await run('if false; or true\n    echo success1\nend')).toBe(
		'success1'
	);
});

// andor.fish: if false; and false; echo failure1; end
test('fish andor: andor.fish - and continuation keeps if condition false', async () => {
	expect(await run('if false; and false\n    echo failure1\nend')).toBe('');
});

// andor.fish: while false; and false; or true ... break
test('fish andor: andor.fish - while condition chains and/or continuations', async () => {
	const script = [
		'while false; and false; or true',
		'    echo success2',
		'    break',
		'end',
	].join('\n');
	expect(await run(script)).toBe('success2');
});

// andor.fish: while false; or begin; false; or true; end ... break
test('fish andor: andor.fish - begin block inside while condition continuation', async () => {
	const script = [
		'while false; or begin',
		'        false; or true',
		'    end',
		'    echo success3',
		'    break',
		'end',
	].join('\n');
	expect(await run(script)).toBe('success3');
});

// andor.fish: if false; else if false; and true; else if false; or true ...
test('fish andor: andor.fish - else if conditions support and/or continuations', async () => {
	const script = [
		'if false',
		'else if false; and true',
		'else if false; and false',
		'else if false; or true',
		'    echo success4',
		'end',
	].join('\n');
	expect(await run(script)).toBe('success4');
});

// andor.fish: no branch matches when all continuations fail
test('fish andor: andor.fish - no else if branch runs when all conditions fail', async () => {
	const script = [
		'if false',
		'else if false; and true',
		'else if false; or false',
		'else if false',
		'    echo "failure 4"',
		'end',
	].join('\n');
	expect(await run(script)).toBe('');
});

// andor.fish: if false; or true | false; echo failure5; end
test('fish andor: andor.fish - pipeline status decides the or continuation', async () => {
	expect(await run('if false; or true | false\n    echo failure5\nend')).toBe(
		''
	);
});
