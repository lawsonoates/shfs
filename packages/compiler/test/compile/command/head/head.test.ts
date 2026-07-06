import { expect, test } from 'bun:test';
import { compileHead } from '@/compile/command/head/head';
import { cmd, literal } from '@/ir';

test('head with single file', () => {
	const result = compileHead(cmd('head', [literal('file.txt')]));
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 10 },
		cmd: 'head',
	});
});

test('head with multiple files', () => {
	const result = compileHead(
		cmd('head', [literal('file1.txt'), literal('file2.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file1.txt'), literal('file2.txt')], n: 10 },
		cmd: 'head',
	});
});

test('head with -n flag', () => {
	const result = compileHead(
		cmd('head', [literal('-n'), literal('5'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 5 },
		cmd: 'head',
	});
});

test('head with -N format (e.g., -5)', () => {
	const result = compileHead(
		cmd('head', [literal('-5'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 5 },
		cmd: 'head',
	});
});

test('head with -n and multiple files', () => {
	const result = compileHead(
		cmd('head', [
			literal('-n'),
			literal('20'),
			literal('file1.txt'),
			literal('file2.txt'),
		])
	);
	expect(result).toEqual({
		args: { files: [literal('file1.txt'), literal('file2.txt')], n: 20 },
		cmd: 'head',
	});
});

test('head with -n=value format', () => {
	const result = compileHead(
		cmd('head', [literal('-n=7'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 7 },
		cmd: 'head',
	});
});

test('head with repeated count flags uses last value', () => {
	const result = compileHead(
		cmd('head', [
			literal('-n'),
			literal('5'),
			literal('-10'),
			literal('file.txt'),
		])
	);
	expect(result).toEqual({
		args: { files: [literal('file.txt')], n: 10 },
		cmd: 'head',
	});
});

test('head with absolute path', () => {
	const result = compileHead(cmd('head', [literal('/tmp/file.txt')]));
	expect(result).toEqual({
		args: { files: [literal('/tmp/file.txt')], n: 10 },
		cmd: 'head',
	});
});

test('head -n without number throws error', () => {
	expect(() => {
		compileHead(cmd('head', [literal('-n')]));
	}).toThrow('head -n requires a number');
});

test('head with invalid -n value throws error', () => {
	expect(() => {
		compileHead(
			cmd('head', [
				literal('-n'),
				literal('invalid'),
				literal('file.txt'),
			])
		);
	}).toThrow('Invalid head count');
});

test('head with unknown option throws error', () => {
	expect(() => {
		compileHead(cmd('head', [literal('-x'), literal('file.txt')]));
	}).toThrow('Unknown head option');
});
