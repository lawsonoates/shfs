import { expect, test } from 'bun:test';
import { compileRm } from '#compiler/compile/command/rm/rm';
import { cmd, literal } from '#compiler/ir';

test('rm with single file', () => {
	const result = compileRm(cmd('rm', [literal('file.txt')]));
	expect(result).toEqual({
		args: {
			force: false,
			interactive: false,
			paths: [literal('file.txt')],
			recursive: false,
		},
		cmd: 'rm',
	});
});

test('rm with absolute path', () => {
	const result = compileRm(cmd('rm', [literal('/tmp/file.txt')]));
	expect(result).toEqual({
		args: {
			force: false,
			interactive: false,
			paths: [literal('/tmp/file.txt')],
			recursive: false,
		},
		cmd: 'rm',
	});
});

test('rm with no arguments throws error', () => {
	expect(() => {
		compileRm(cmd('rm', []));
	}).toThrow('rm requires at least one path');
});

test('rm with multiple files', () => {
	const result = compileRm(
		cmd('rm', [
			literal('file1.txt'),
			literal('file2.txt'),
			literal('file3.txt'),
		])
	);
	expect(result).toEqual({
		args: {
			force: false,
			interactive: false,
			paths: [
				literal('file1.txt'),
				literal('file2.txt'),
				literal('file3.txt'),
			],
			recursive: false,
		},
		cmd: 'rm',
	});
});

test('rm with -r flag', () => {
	const result = compileRm(cmd('rm', [literal('-r'), literal('dir1')]));
	expect(result).toEqual({
		args: {
			force: false,
			interactive: false,
			paths: [literal('dir1')],
			recursive: true,
		},
		cmd: 'rm',
	});
});

test('rm with -r and multiple paths', () => {
	const result = compileRm(
		cmd('rm', [
			literal('-r'),
			literal('dir1'),
			literal('dir2'),
			literal('dir3'),
		])
	);
	expect(result).toEqual({
		args: {
			force: false,
			interactive: false,
			paths: [literal('dir1'), literal('dir2'), literal('dir3')],
			recursive: true,
		},
		cmd: 'rm',
	});
});

test('rm with -f flag maps to force mode', () => {
	const result = compileRm(cmd('rm', [literal('-f'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			force: true,
			interactive: false,
			paths: [literal('file.txt')],
			recursive: false,
		},
		cmd: 'rm',
	});
});

test('rm with -i flag maps to interactive mode', () => {
	const result = compileRm(cmd('rm', [literal('-i'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			force: false,
			interactive: true,
			paths: [literal('file.txt')],
			recursive: false,
		},
		cmd: 'rm',
	});
});
