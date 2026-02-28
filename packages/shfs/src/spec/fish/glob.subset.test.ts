import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;
const WHITESPACE_REGEX = /\s+/;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
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

	await expect(run('ls missing*')).rejects.toThrow(
		'ls: no matches found: missing*'
	);
	await expect(run('touch missing*')).rejects.toThrow(
		'touch: no matches found: missing*'
	);
});

test('glob subset (boundary): single-target path commands enforce post-expansion cardinality', async () => {
	await run('mkdir -p /workspace');
	await run('mkdir /workspace/dir-a /workspace/dir-b');
	await run('touch /workspace/file.txt');

	await expect(run('cd /workspace/dir-*')).rejects.toThrow(
		'cd: expected exactly 1 path after expansion, got 2'
	);
	await expect(
		run('cp /workspace/file.txt /workspace/dir-*')
	).rejects.toThrow('cp: destination must expand to exactly 1 path, got 2');
	await expect(
		run('mv /workspace/file.txt /workspace/dir-*')
	).rejects.toThrow('mv: destination must expand to exactly 1 path, got 2');
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
	await expect(run('echo /workspace/moved/src-*.txt')).rejects.toThrow(
		'echo: no matches found: /workspace/moved/src-*.txt'
	);

	await run('mkdir /workspace/group-a /workspace/group-b');
	await expect(run('mkdir /workspace/group-*/nested')).rejects.toThrow(
		'mkdir: no matches found: /workspace/group-*/nested'
	);
	await run('touch /workspace/group-a/note.txt /workspace/group-b/note.txt');
	await run('touch /workspace/group-*/note.txt');
	expect(sortedWords(await run('echo /workspace/group-*/note.txt'))).toEqual([
		'/workspace/group-a/note.txt',
		'/workspace/group-b/note.txt',
	]);
});
