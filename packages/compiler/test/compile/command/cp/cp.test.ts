import { expect, test } from 'bun:test';
import { compileCp } from '@/compile/command/cp/cp';
import { cmd, literal } from '@/ir';

test('cp with source and destination', () => {
	const result = compileCp(
		cmd('cp', [literal('file.txt'), literal('file_copy.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('file_copy.txt'),
			force: false,
			interactive: false,
			recursive: false,
			srcs: [literal('file.txt')],
		},
		cmd: 'cp',
	});
});

test('cp with paths', () => {
	const result = compileCp(
		cmd('cp', [literal('/home/user/file.txt'), literal('/tmp/')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('/tmp/'),
			force: false,
			interactive: false,
			recursive: false,
			srcs: [literal('/home/user/file.txt')],
		},
		cmd: 'cp',
	});
});

test('cp with no source throws error', () => {
	expect(() => {
		compileCp(cmd('cp', []));
	}).toThrow('cp requires source and destination');
});

test('cp with only source throws error', () => {
	expect(() => {
		compileCp(cmd('cp', [literal('file.txt')]));
	}).toThrow('cp requires source and destination');
});

test('cp with multiple sources', () => {
	const result = compileCp(
		cmd('cp', [
			literal('file1.txt'),
			literal('file2.txt'),
			literal('file3.txt'),
		])
	);
	expect(result).toEqual({
		args: {
			dest: literal('file3.txt'),
			force: false,
			interactive: false,
			recursive: false,
			srcs: [literal('file1.txt'), literal('file2.txt')],
		},
		cmd: 'cp',
	});
});

test('cp with -r flag', () => {
	const result = compileCp(
		cmd('cp', [literal('-r'), literal('dir1'), literal('dir2')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('dir2'),
			force: false,
			interactive: false,
			recursive: true,
			srcs: [literal('dir1')],
		},
		cmd: 'cp',
	});
});

test('cp with -r and multiple sources', () => {
	const result = compileCp(
		cmd('cp', [
			literal('-r'),
			literal('src1'),
			literal('src2'),
			literal('destdir'),
		])
	);
	expect(result).toEqual({
		args: {
			dest: literal('destdir'),
			force: false,
			interactive: false,
			recursive: true,
			srcs: [literal('src1'), literal('src2')],
		},
		cmd: 'cp',
	});
});

test('cp with -f flag maps to force mode', () => {
	const result = compileCp(
		cmd('cp', [literal('-f'), literal('file.txt'), literal('copy.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('copy.txt'),
			force: true,
			interactive: false,
			recursive: false,
			srcs: [literal('file.txt')],
		},
		cmd: 'cp',
	});
});

test('cp with -i flag maps to interactive mode', () => {
	const result = compileCp(
		cmd('cp', [literal('-i'), literal('file.txt'), literal('copy.txt')])
	);
	expect(result).toEqual({
		args: {
			dest: literal('copy.txt'),
			force: false,
			interactive: true,
			recursive: false,
			srcs: [literal('file.txt')],
		},
		cmd: 'cp',
	});
});
