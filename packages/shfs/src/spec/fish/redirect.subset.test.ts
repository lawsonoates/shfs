// Translated/adapted from fish-shell tests/checks/redirect.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/redirect.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: fish redirect.fish covers fd duplication (>&2, <&3), stderr piping
// (2>|), noclobber (?), closed fds (<&-), and many features that require
// host OS fd semantics. This subset covers only basic stdout file
// redirection (> and >>), which is within shfs scope.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// redirect.fish: echo -n >$tmpdir/file.txt; test -f $tmpdir/file.txt
// Redirection with empty data still creates the file.
test('redirect subset: redirection creates the target file even with no output', async () => {
	await run('mkdir -p /tmp');
	await run('echo "" > /tmp/empty.txt');
	expect(await run('cat /tmp/empty.txt')).toBe('');
});

// Basic stdout redirection to a file.
test('redirect subset: stdout redirection writes output to a file', async () => {
	await run('mkdir -p /tmp');
	await run('echo hello > /tmp/out.txt');
	expect(await run('cat /tmp/out.txt')).toBe('hello');
});

// Redirection overwrites existing content.
test('redirect subset: redirection overwrites existing file content', async () => {
	await run('mkdir -p /tmp');
	await run('echo first > /tmp/overwrite.txt');
	await run('echo second > /tmp/overwrite.txt');
	expect(await run('cat /tmp/overwrite.txt')).toBe('second');
});

// Redirection target with nested path.
test('redirect subset: redirection to a nested path', async () => {
	await run('mkdir -p /project/tests');
	await run('echo content > /project/tests/output.txt');
	expect(await run('cat /project/tests/output.txt')).toBe('content');
});

// Redirection target with dots in the filename.
// This is directly relevant to the original bug where
// echo "..." > project/tests/index.test.ts failed.
test('redirect subset: redirection target with dots in filename', async () => {
	await run('mkdir -p /project/tests');
	await run("echo 'console.log(1)' > /project/tests/index.test.ts");
	expect(await run('cat /project/tests/index.test.ts')).toBe(
		'console.log(1)'
	);
});

// Redirection with variable expansion in the target path.
test('redirect subset: redirection target can use variable expansion', async () => {
	await run('mkdir -p /tmp');
	await run('set -g outfile /tmp/varpath.txt');
	await run('echo via-var > $outfile');
	expect(await run('cat $outfile')).toBe('via-var');
});

// Redirection with command substitution in the content.
test('redirect subset: redirected content can include command substitution', async () => {
	await run('mkdir -p /tmp');
	await run('echo (echo generated) > /tmp/cmdsub.txt');
	expect(await run('cat /tmp/cmdsub.txt')).toBe('generated');
});

// Redirection combined with double-quoted content containing parens.
// Directly tests the original bug scenario.
test('redirect subset: double-quoted content with parens redirected to dotted filename', async () => {
	await run('mkdir -p /project/tests');
	await run(
		"echo \"console.log('test')\" > /project/tests/index.test.ts"
	);
	expect(await run('cat /project/tests/index.test.ts')).toBe(
		"console.log('test')"
	);
});

// Redirection to a relative path after cd.
test('redirect subset: redirection to a relative path respects cwd', async () => {
	await run('mkdir -p /workspace/output');
	await run('cd /workspace/output');
	await run('echo relative > result.txt');
	expect(await run('cat /workspace/output/result.txt')).toBe('relative');
});

