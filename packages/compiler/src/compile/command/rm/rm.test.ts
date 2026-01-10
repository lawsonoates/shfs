import { expect, test } from 'bun:test';

import { compileRm } from './rm';

test('rm with single file', () => {
	const result = compileRm({ args: ['file.txt'], name: 'rm' });
	expect(result).toEqual({
		args: { paths: ['file.txt'], recursive: false },
		cmd: 'rm',
	});
});

test('rm with absolute path', () => {
	const result = compileRm({ args: ['/tmp/file.txt'], name: 'rm' });
	expect(result).toEqual({
		args: { paths: ['/tmp/file.txt'], recursive: false },
		cmd: 'rm',
	});
});

test('rm with no arguments throws error', () => {
	expect(() => {
		compileRm({ args: [], name: 'rm' });
	}).toThrow('rm requires at least one path');
});

test('rm with multiple files', () => {
	const result = compileRm({
		args: ['file1.txt', 'file2.txt', 'file3.txt'],
		name: 'rm',
	});
	expect(result).toEqual({
		args: { paths: ['file1.txt', 'file2.txt', 'file3.txt'], recursive: false },
		cmd: 'rm',
	});
});

test('rm with -r flag', () => {
	const result = compileRm({
		args: ['-r', 'dir1'],
		name: 'rm',
	});
	expect(result).toEqual({
		args: { paths: ['dir1'], recursive: true },
		cmd: 'rm',
	});
});

test('rm with -r and multiple paths', () => {
	const result = compileRm({
		args: ['-r', 'dir1', 'dir2', 'dir3'],
		name: 'rm',
	});
	expect(result).toEqual({
		args: { paths: ['dir1', 'dir2', 'dir3'], recursive: true },
		cmd: 'rm',
	});
});

test('rm with -f flag (ignored in compile)', () => {
	const result = compileRm({
		args: ['-f', 'file.txt'],
		name: 'rm',
	});
	expect(result).toEqual({
		args: { paths: ['file.txt'], recursive: false },
		cmd: 'rm',
	});
});
