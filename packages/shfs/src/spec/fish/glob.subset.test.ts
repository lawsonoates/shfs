// Translated/adapted from fish-shell tests/checks/glob.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/glob.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;
const STATUS_PREFIX = '__SHFS_STATUS__=';
const WHITESPACE_REGEX = /\s+/;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runWithStatus(
	command: string
): Promise<{ output: string; status: number }> {
	const output = await run(command);
	const marker = await run(`echo "${STATUS_PREFIX}$status"`);
	if (!marker.startsWith(STATUS_PREFIX)) {
		throw new Error(`Invalid status marker: ${marker}`);
	}

	const status = Number.parseInt(marker.slice(STATUS_PREFIX.length), 10);
	if (Number.isNaN(status)) {
		throw new Error(`Invalid status marker: ${marker}`);
	}

	return {
		output,
		status,
	};
}

function sortedWords(output: string): string[] {
	const trimmed = output.trim();
	if (trimmed === '') {
		return [];
	}
	return trimmed.split(WHITESPACE_REGEX).sort();
}

test('glob subset (glob.fish): hidden files are only matched with explicit dot', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');
	await run('touch .hidden visible');

	expect(await run('echo *')).toBe('visible');
	expect(await run('echo .*')).toBe('.hidden');
});

test('glob subset (glob.fish): trailing slash matches only directories', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');
	await run('touch abc1');
	await run('mkdir abc2');

	expect(sortedWords(await run('echo *'))).toEqual(['abc1', 'abc2']);
	expect(await run('echo */')).toBe('abc2/');
});

// Symlink traversal sections from fish tests/checks/glob.fish are intentionally
// excluded because symlink behavior is explicitly out of scope for shfs.

test('glob subset (glob.fish): recursive globs support ** patterns and trailing slash semantics', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');
	await run('mkdir -p dir_a1/dir_a2/dir_a3');
	await run('touch dir_a1/dir_a2/dir_a3/file_a');
	await run('mkdir -p dir_b1/dir_b2/dir_b3');
	await run('touch dir_b1/dir_b2/dir_b3/file_b');

	expect(sortedWords(await run('echo **/file_*'))).toEqual([
		'dir_a1/dir_a2/dir_a3/file_a',
		'dir_b1/dir_b2/dir_b3/file_b',
	]);

	expect(sortedWords(await run('echo **a3/file_*'))).toEqual([
		'dir_a1/dir_a2/dir_a3/file_a',
	]);

	expect(sortedWords(await run('echo **'))).toEqual([
		'dir_a1',
		'dir_a1/dir_a2',
		'dir_a1/dir_a2/dir_a3',
		'dir_a1/dir_a2/dir_a3/file_a',
		'dir_b1',
		'dir_b1/dir_b2',
		'dir_b1/dir_b2/dir_b3',
		'dir_b1/dir_b2/dir_b3/file_b',
	]);

	expect(sortedWords(await run('echo **/'))).toEqual([
		'dir_a1/',
		'dir_a1/dir_a2/',
		'dir_a1/dir_a2/dir_a3/',
		'dir_b1/',
		'dir_b1/dir_b2/',
		'dir_b1/dir_b2/dir_b3/',
	]);

	expect(sortedWords(await run('echo **a2/**'))).toEqual([
		'dir_a1/dir_a2',
		'dir_a1/dir_a2/dir_a3',
		'dir_a1/dir_a2/dir_a3/file_a',
	]);
});

test('glob subset (glob.fish): literal segment ** matches in the same directory', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');
	await run('mkdir foo');
	await run('touch bar foo/bar');

	expect(sortedWords(await run('echo **/bar'))).toEqual(['bar', 'foo/bar']);
});

test('glob subset (boundary): supports ?, [], and * wildcard families', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');
	await run('touch a.txt b.txt c.txt aa.txt');

	expect(sortedWords(await run('echo ?.txt'))).toEqual([
		'a.txt',
		'b.txt',
		'c.txt',
	]);
	expect(sortedWords(await run('echo [ab].txt'))).toEqual(['a.txt', 'b.txt']);
	expect(sortedWords(await run('echo *.txt'))).toEqual([
		'a.txt',
		'aa.txt',
		'b.txt',
		'c.txt',
	]);
});

test('glob subset (boundary): quoted wildcard characters are literal text, not patterns', async () => {
	expect(await run("echo '*' '?' '[ab]' '**'")).toBe('* ? [ab] **');
});

test('glob subset (boundary): quoted wildcard characters are literal in path-taking commands', async () => {
	await run('mkdir -p /workspace');
	await run('mkdir "/workspace/*literal*"');
	await run('touch "/workspace/*literal*/file?.txt"');

	await run('cd "/workspace/*literal*"');
	expect(await run('pwd')).toBe('/workspace/*literal*');
	expect(await run('cat "/workspace/*literal*/file?.txt"')).toBe('');
});

test('glob subset (boundary): unmatched wildcard reports deterministic error', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');

	const lsResult = await runWithStatus('ls missing*');
	expect(lsResult.output).toContain('error[expansion:no-match]');
	expect(lsResult.output).toContain('missing*');
	expect(lsResult.status).toBe(1);

	const touchResult = await runWithStatus('touch missing*');
	expect(touchResult.output).toContain('error[expansion:no-match]');
	expect(touchResult.output).toContain('missing*');
	expect(touchResult.status).toBe(1);
});

test('glob subset (boundary): single-target path commands enforce post-expansion cardinality', async () => {
	await run('mkdir -p /workspace');
	await run('mkdir /workspace/dir-a /workspace/dir-b');
	await run('touch /workspace/file.txt');

	const cdResult = await runWithStatus('cd /workspace/dir-*');
	expect(cdResult.output).toContain('error[expansion:invalid-path-count]');
	expect(cdResult.output).toContain(
		'expected exactly 1 path after expansion'
	);
	expect(cdResult.status).toBe(1);

	const cpResult = await runWithStatus(
		'cp /workspace/file.txt /workspace/dir-*'
	);
	expect(cpResult.output).toContain('error[expansion:invalid-path-count]');
	expect(cpResult.output).toContain(
		'destination must expand to exactly 1 path'
	);
	expect(cpResult.status).toBe(1);

	const mvResult = await runWithStatus(
		'mv /workspace/file.txt /workspace/dir-*'
	);
	expect(mvResult.output).toContain('error[expansion:invalid-path-count]');
	expect(mvResult.output).toContain(
		'destination must expand to exactly 1 path'
	);
	expect(mvResult.status).toBe(1);
});

test('glob subset (boundary): redirection targets enforce shared single-target expansion errors', async () => {
	await run('mkdir -p /workspace');
	await run('mkdir /workspace/dir-a /workspace/dir-b');
	await run('cd /workspace');

	const result = await runWithStatus('echo hi > dir-*');
	expect(result.output).toContain('error[expansion:invalid-path-count]');
	expect(result.output).toContain(
		'redirection target must expand to exactly 1 path'
	);
	expect(result.status).toBe(1);
});

test('glob subset (boundary): unmatched redirection globs report deterministic failures', async () => {
	await run('mkdir -p /workspace');
	await run('cd /workspace');

	const result = await runWithStatus('echo hi > missing*');
	expect(result.output).toContain('error[expansion:no-match]');
	expect(result.output).toContain('missing*');
	expect(result.status).toBe(1);
});

test('glob subset (boundary): multi-target path commands consume expanded glob arguments', async () => {
	await run('mkdir -p /workspace');
	await run('touch /workspace/src-a.txt /workspace/src-b.txt');
	await run('mkdir /workspace/copies /workspace/moved');

	await run('cp /workspace/src-*.txt /workspace/copies');
	expect(sortedWords(await run('echo /workspace/copies/src-*.txt'))).toEqual([
		'/workspace/copies/src-a.txt',
		'/workspace/copies/src-b.txt',
	]);

	await run('mv /workspace/copies/src-*.txt /workspace/moved');
	expect(sortedWords(await run('echo /workspace/moved/src-*.txt'))).toEqual([
		'/workspace/moved/src-a.txt',
		'/workspace/moved/src-b.txt',
	]);

	await run('rm /workspace/moved/src-*.txt');
	const echoResult = await runWithStatus('echo /workspace/moved/src-*.txt');
	expect(echoResult.output).toContain('error[expansion:no-match]');
	expect(echoResult.output).toContain('/workspace/moved/src-*.txt');
	expect(echoResult.status).toBe(1);

	await run('mkdir /workspace/group-a /workspace/group-b');
	const mkdirResult = await runWithStatus('mkdir /workspace/group-*/nested');
	expect(mkdirResult.output).toContain('error[expansion:no-match]');
	expect(mkdirResult.output).toContain('/workspace/group-*/nested');
	expect(mkdirResult.status).toBe(1);
	await run('touch /workspace/group-a/note.txt /workspace/group-b/note.txt');
	await run('touch /workspace/group-*/note.txt');
	expect(sortedWords(await run('echo /workspace/group-*/note.txt'))).toEqual([
		'/workspace/group-a/note.txt',
		'/workspace/group-b/note.txt',
	]);
});
