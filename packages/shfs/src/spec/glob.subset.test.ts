import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../fs/memory';
import { Shell } from '../shell/shell';

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
