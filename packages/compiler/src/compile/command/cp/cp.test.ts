import { expect, test } from 'bun:test';

import { compileCp } from './cp';

test('cp with source and destination', () => {
	const result = compileCp({ args: ['file.txt', 'file_copy.txt'], name: 'cp' });
	expect(result).toEqual({
		args: { dest: 'file_copy.txt', recursive: false, srcs: ['file.txt'] },
		cmd: 'cp',
	});
});

test('cp with paths', () => {
	const result = compileCp({
		args: ['/home/user/file.txt', '/tmp/'],
		name: 'cp',
	});
	expect(result).toEqual({
		args: { dest: '/tmp/', recursive: false, srcs: ['/home/user/file.txt'] },
		cmd: 'cp',
	});
});

test('cp with no source throws error', () => {
	expect(() => {
		compileCp({ args: [], name: 'cp' });
	}).toThrow('cp requires source and destination');
});

test('cp with only source throws error', () => {
	expect(() => {
		compileCp({ args: ['file.txt'], name: 'cp' });
	}).toThrow('cp requires source and destination');
});

test('cp with multiple sources', () => {
	const result = compileCp({
		args: ['file1.txt', 'file2.txt', 'file3.txt'],
		name: 'cp',
	});
	expect(result).toEqual({
		args: {
			dest: 'file3.txt',
			recursive: false,
			srcs: ['file1.txt', 'file2.txt'],
		},
		cmd: 'cp',
	});
});

test('cp with -r flag', () => {
	const result = compileCp({
		args: ['-r', 'dir1', 'dir2'],
		name: 'cp',
	});
	expect(result).toEqual({
		args: { dest: 'dir2', recursive: true, srcs: ['dir1'] },
		cmd: 'cp',
	});
});

test('cp with -r and multiple sources', () => {
	const result = compileCp({
		args: ['-r', 'src1', 'src2', 'destdir'],
		name: 'cp',
	});
	expect(result).toEqual({
		args: { dest: 'destdir', recursive: true, srcs: ['src1', 'src2'] },
		cmd: 'cp',
	});
});

test('cp with -f flag (ignored in compile)', () => {
	const result = compileCp({
		args: ['-f', 'file.txt', 'copy.txt'],
		name: 'cp',
	});
	expect(result).toEqual({
		args: { dest: 'copy.txt', recursive: false, srcs: ['file.txt'] },
		cmd: 'cp',
	});
});
