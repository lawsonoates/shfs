import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let fs!: MemoryFS;
let shell!: Shell;

beforeEach(() => {
	fs = new MemoryFS();
	shell = new Shell(fs);
});

test("wc treats '-' as stdin for normal operands", async () => {
	fs.setFile('/tmp/stdin.txt', 'x\n');

	const result = await shell.$`wc - < /tmp/stdin.txt`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('1 1 2 -');
	expect(result.stderr.toString()).toBe('');
});

test('wc reports missing redirected stdin as an error', async () => {
	const result = await shell.$`wc < /tmp/missing.txt`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain('/tmp/missing.txt');
	expect(result.stderr.toString()).toContain('No such file or directory');
});

test('wc --total=always includes a total for stdin-only input', async () => {
	fs.setFile('/tmp/stdin.txt', 'x\n');

	const result = await shell.$`wc --total=always < /tmp/stdin.txt`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe(
		'      1       1       2\n      1       1       2 total'
	);
	expect(result.stderr.toString()).toBe('');
});

test('wc -L expands tabs to 8-column stops for files and totals', async () => {
	fs.setFile('/tabbed', 'a\tbc\n');
	fs.setFile('/plain', 'x\n');

	const result = await shell.$`wc -L /tabbed /plain`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('10 /tabbed\n 1 /plain\n10 total');
	expect(result.stderr.toString()).toBe('');
});
