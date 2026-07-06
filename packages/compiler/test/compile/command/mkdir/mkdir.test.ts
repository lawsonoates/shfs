import { expect, test } from 'bun:test';
import { compileMkdir } from '@/compile/command/mkdir/mkdir';
import { cmd, literal } from '@/ir';

test('mkdir with single directory', () => {
	const result = compileMkdir(cmd('mkdir', [literal('mydir')]));
	expect(result).toEqual({
		args: { parents: false, paths: [literal('mydir')], recursive: false },
		cmd: 'mkdir',
	});
});

test('mkdir with multiple directories', () => {
	const result = compileMkdir(
		cmd('mkdir', [literal('dir1'), literal('dir2'), literal('dir3')])
	);
	expect(result).toEqual({
		args: {
			parents: false,
			paths: [literal('dir1'), literal('dir2'), literal('dir3')],
			recursive: false,
		},
		cmd: 'mkdir',
	});
});

test('mkdir with absolute path', () => {
	const result = compileMkdir(cmd('mkdir', [literal('/tmp/mydir')]));
	expect(result).toEqual({
		args: {
			parents: false,
			paths: [literal('/tmp/mydir')],
			recursive: false,
		},
		cmd: 'mkdir',
	});
});

test('mkdir with -p flag (recursive)', () => {
	const result = compileMkdir(
		cmd('mkdir', [literal('-p'), literal('/tmp/a/b/c')])
	);
	expect(result).toEqual({
		args: {
			parents: true,
			paths: [literal('/tmp/a/b/c')],
			recursive: true,
		},
		cmd: 'mkdir',
	});
});

test('mkdir with -p flag and multiple paths', () => {
	const result = compileMkdir(
		cmd('mkdir', [
			literal('-p'),
			literal('dir1/subdir'),
			literal('dir2/subdir'),
		])
	);
	expect(result).toEqual({
		args: {
			parents: true,
			paths: [literal('dir1/subdir'), literal('dir2/subdir')],
			recursive: true,
		},
		cmd: 'mkdir',
	});
});

test('mkdir with no arguments throws error', () => {
	expect(() => {
		compileMkdir(cmd('mkdir', []));
	}).toThrow('mkdir requires at least one path');
});
