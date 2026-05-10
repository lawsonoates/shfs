import { expect, test } from 'bun:test';
import { compileTail } from '../../../../../packages/compiler/src/compile/command/tail/tail';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('tail with -N format (negative number)', () => {
	const result = compileTail(cmd('tail', [literal('-10')]));
	expect(result).toEqual({
		args: { files: [], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n N format', () => {
	const result = compileTail(cmd('tail', [literal('-n'), literal('20')]));
	expect(result).toEqual({
		args: { files: [], n: 20 },
		cmd: 'tail',
	});
});

test('tail with -n and larger number', () => {
	const result = compileTail(cmd('tail', [literal('-n'), literal('100')]));
	expect(result).toEqual({
		args: { files: [], n: 100 },
		cmd: 'tail',
	});
});

test('tail with -n=value format', () => {
	const result = compileTail(cmd('tail', [literal('-n=12')]));
	expect(result).toEqual({
		args: { files: [], n: 12 },
		cmd: 'tail',
	});
});

test('tail with repeated count flags uses last value', () => {
	const result = compileTail(
		cmd('tail', [literal('-n'), literal('5'), literal('-20')])
	);
	expect(result).toEqual({
		args: { files: [], n: 20 },
		cmd: 'tail',
	});
});

test('tail with no arguments defaults to n=10', () => {
	const result = compileTail(cmd('tail', []));
	expect(result).toEqual({
		args: { files: [], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n but no number throws error', () => {
	expect(() => {
		compileTail(cmd('tail', [literal('-n')]));
	}).toThrow('tail -n requires a number');
});

test('tail with file argument', () => {
	const result = compileTail(
		cmd('tail', [literal('-10'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 10 },
		cmd: 'tail',
	});
});

test('tail with -n and file argument', () => {
	const result = compileTail(
		cmd('tail', [literal('-n'), literal('20'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 20 },
		cmd: 'tail',
	});
});

test('tail with multiple file arguments', () => {
	const result = compileTail(
		cmd('tail', [literal('-5'), literal('file1.txt'), literal('file2.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file1.txt'), literal('file2.txt')], n: 5 },
		cmd: 'tail',
	});
});

test('tail with non-numeric -N throws error', () => {
	expect(() => {
		compileTail(cmd('tail', [literal('-abc')]));
	}).toThrow('Unknown tail option');
});

test('tail -n with non-numeric throws error', () => {
	expect(() => {
		compileTail(cmd('tail', [literal('-n'), literal('abc')]));
	}).toThrow('Invalid tail count');
});
