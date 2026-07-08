// Translated/adapted from fish-shell tests/checks/variable-assignment.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/variable-assignment.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: upstream cases involving brace expansion values, `sh -c`, `switch`,
// aliases, and completion are out of scope. Upstream wraps invalid-grammar
// cases in `eval`; shfs reports them as deterministic script failures.

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

// variable-assignment.fish: foo=bar echo $foo
test('fish variable-assignment: variable-assignment.fish - assignment is visible to the command', async () => {
	expect(await run('foo=bar echo $foo')).toBe('bar');
});

// variable-assignment.fish: set -q foo; or echo nil
test('fish variable-assignment: variable-assignment.fish - assignment does not outlive the command', async () => {
	expect(await run('foo=bar true\nset -q foo; or echo nil')).toBe('nil');
});

// variable-assignment.fish: a=(echo 1 2 3) echo $a
// (echo emits one line, so the substitution value is a single element.)
test('fish variable-assignment: variable-assignment.fish - command substitution provides the value', async () => {
	expect(await run('a=(echo 1 2 3) echo $a')).toBe('1 2 3');
	expect(await run('a=(echo 1 2 3) count $a')).toBe('1');
});

// Multi-line command substitutions become multi-element lists.
test('fish variable-assignment: variable-assignment.fish - multi-line substitution value becomes a list', async () => {
	const script = [
		'function three',
		'    echo 1',
		'    echo 2',
		'    echo 3',
		'end',
		'a=(three) count $a',
	].join('\n');
	expect(await run(script)).toBe('3');
});

// variable-assignment.fish: a=failing-glob-* count $a
test('fish variable-assignment: variable-assignment.fish - unmatched glob value expands to an empty list', async () => {
	const result = await runResult('a=failing-glob-* count $a');
	expect(result.stdout).toBe('0');
	expect(result.stderr).toBe('');
});

// variable-assignment.fish: a=b true | echo "'$a'"
test('fish variable-assignment: variable-assignment.fish - assignment applies only to its own pipeline command', async () => {
	expect(await run(`a=b true | echo "'$a'"`)).toBe("''");
});

// variable-assignment.fish: if a=b true; echo "'$a'"; end
test('fish variable-assignment: variable-assignment.fish - assignment on the condition is not visible in the body', async () => {
	expect(await run(`if a=b true\n    echo "'$a'"\nend`)).toBe("''");
});

// variable-assignment.fish: not a=b echo $a
// (`not echo` succeeds at printing, so the job status is inverted to 1.)
test('fish variable-assignment: variable-assignment.fish - assignment after not applies to the command', async () => {
	const result = await runResult('not a=b echo $a');
	expect(result.stdout).toBe('b');
	expect(result.exitCode).toBe(1);
});

// variable-assignment.fish: a=b not echo $a
test('fish variable-assignment: variable-assignment.fish - assignment before not applies to the command', async () => {
	const result = await runResult('a=b not echo $a');
	expect(result.stdout).toBe('b');
	expect(result.exitCode).toBe(1);
});

// variable-assignment.fish: yPATH=/usr/bin:/bin count $yPATH
test('fish variable-assignment: variable-assignment.fish - PATH-like names split on colons', async () => {
	expect(await run('yPATH=/usr/bin:/bin count $yPATH')).toBe('2');
});

// variable-assignment.fish: a=b begin; true | echo $a; end
test('fish variable-assignment: variable-assignment.fish - assignment before begin covers the block', async () => {
	expect(await run('a=b begin\n    true | echo $a\nend')).toBe('b');
});

// variable-assignment.fish: a=b if true; echo $a; end
test('fish variable-assignment: variable-assignment.fish - assignment before if covers the block', async () => {
	expect(await run('a=b if true\n    echo $a\nend')).toBe('b');
});

// variable-assignment.fish: eval 'a=(echo b)' → Unsupported use of '='.
test('fish variable-assignment: variable-assignment.fish - bare assignment without a command is an error', async () => {
	const result = await runResult('a=b');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Unsupported use of '='");
});

// variable-assignment.fish: eval ': | a=b'
test('fish variable-assignment: variable-assignment.fish - trailing bare assignment in a pipeline is an error', async () => {
	const result = await runResult('true | a=b');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Unsupported use of '='");
});

// variable-assignment.fish: eval 'not a=b'
test('fish variable-assignment: variable-assignment.fish - bare assignment after not is an error', async () => {
	const result = await runResult('not a=b');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Unsupported use of '='");
});
