import { expect, test } from 'bun:test';
import { compileMv } from '../../../../../packages/compiler/src/compile/command/mv/mv';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('mv with single file', () => {
	const result = compileMv(
		cmd('mv', [literal('source.txt'), literal('dest.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('dest.txt'),
			force: false,
			interactive: false,
			srcs: [literal('source.txt')],
		},
		cmd: 'mv',
	});
});

test('mv with multiple sources', () => {
	const result = compileMv(
		cmd('mv', [literal('file1.txt'), literal('file2.txt'), literal('dir/')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('dir/'),
			force: false,
			interactive: false,
			srcs: [literal('file1.txt'), literal('file2.txt')],
		},
		cmd: 'mv',
	});
});

test('mv with absolute paths', () => {
	const result = compileMv(
		cmd('mv', [literal('/tmp/file.txt'), literal('/home/user/file.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('/home/user/file.txt'),
			force: false,
			interactive: false,
			srcs: [literal('/tmp/file.txt')],
		},
		cmd: 'mv',
	});
});

test('mv with -f flag maps to force mode', () => {
	const result = compileMv(
		cmd('mv', [literal('-f'), literal('source.txt'), literal('dest.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('dest.txt'),
			force: true,
			interactive: false,
			srcs: [literal('source.txt')],
		},
		cmd: 'mv',
	});
});

test('mv with -i flag maps to interactive mode', () => {
	const result = compileMv(
		cmd('mv', [literal('source.txt'), literal('-i'), literal('dest.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('dest.txt'),
			force: false,
			interactive: true,
			srcs: [literal('source.txt')],
		},
		cmd: 'mv',
	});
});

test('mv with no arguments throws error', () => {
	expect(() => {
		compileMv(cmd('mv', []));
	}).toThrow('mv requires source and destination');
});

test('mv with single argument throws error', () => {
	expect(() => {
		compileMv(cmd('mv', [literal('file.txt')]));
	}).toThrow('mv requires source and destination');
});
