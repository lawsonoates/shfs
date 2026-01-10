import { expect, test } from 'bun:test';

import { compileTail } from './tail';

test('tail with -N format (negative number)', () => {
	const result = compileTail({ args: ['-10'], name: 'tail' });
	expect(result).toEqual({
		args: { files: [], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n N format', () => {
	const result = compileTail({ args: ['-n', '20'], name: 'tail' });
	expect(result).toEqual({
		args: { files: [], n: 20 },
		cmd: 'tail',
	});
});

test('tail with -n and larger number', () => {
	const result = compileTail({ args: ['-n', '100'], name: 'tail' });
	expect(result).toEqual({
		args: { files: [], n: 100 },
		cmd: 'tail',
	});
});

test('tail with no arguments defaults to n=10', () => {
	const result = compileTail({ args: [], name: 'tail' });
	expect(result).toEqual({
		args: { files: [], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n but no number throws error', () => {
	expect(() => {
		compileTail({ args: ['-n'], name: 'tail' });
	}).toThrow('tail -n requires a number');
});

test('tail with file argument', () => {
	const result = compileTail({ args: ['-10', 'file.txt'], name: 'tail' });
	expect(result).toEqual({
		args: { files: ['file.txt'], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n and file argument', () => {
	const result = compileTail({ args: ['-n', '20', 'file.txt'], name: 'tail' });
	expect(result).toEqual({
		args: { files: ['file.txt'], n: 20 },
		cmd: 'tail',
	});
});

test('tail with multiple file arguments', () => {
	const result = compileTail({
		args: ['-5', 'file1.txt', 'file2.txt'],
		name: 'tail',
	});
	expect(result).toEqual({
		args: { files: ['file1.txt', 'file2.txt'], n: 5 },
		cmd: 'tail',
	});
});

test('tail with non-numeric -N throws error', () => {
	expect(() => {
		compileTail({ args: ['-abc'], name: 'tail' });
	}).toThrow('Unknown tail option');
});

test('tail -n with non-numeric throws error', () => {
	expect(() => {
		compileTail({ args: ['-n', 'abc'], name: 'tail' });
	}).toThrow('Invalid tail count');
});
