import { expect, test } from 'bun:test';

import { compileCat } from './cat';

test('cat with single file', () => {
	const result = compileCat({ args: ['file.txt'], name: 'cat' });
	expect(result).toEqual({
		args: { files: ['file.txt'] },
		cmd: 'cat',
	});
});

test('cat with multiple files', () => {
	const result = compileCat({
		args: ['file1.txt', 'file2.txt', 'file3.txt'],
		name: 'cat',
	});
	expect(result).toEqual({
		args: { files: ['file1.txt', 'file2.txt', 'file3.txt'] },
		cmd: 'cat',
	});
});

test('cat with no arguments throws error', () => {
	expect(() => {
		compileCat({ args: [], name: 'cat' });
	}).toThrow('cat requires at least one file');
});
