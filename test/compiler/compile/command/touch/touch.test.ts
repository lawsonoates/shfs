import { expect, test } from 'bun:test';
import { compileTouch } from '../../../../../packages/compiler/src/compile/command/touch/touch';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('touch with single file', () => {
	const result = compileTouch(cmd('touch', [literal('file.txt')]));
	expect(result).toEqual({
		args: {
			accessTimeOnly: false,
			files: [literal('file.txt')],
			modificationTimeOnly: false,
		},
		cmd: 'touch',
	});
});

test('touch with multiple files', () => {
	const result = compileTouch(
		cmd('touch', [
			literal('file1.txt'),
			literal('file2.txt'),
			literal('file3.txt'),
		])
	);
	expect(result).toEqual({
		args: {
			accessTimeOnly: false,
			files: [
				literal('file1.txt'),
				literal('file2.txt'),
				literal('file3.txt'),
			],
			modificationTimeOnly: false,
		},
		cmd: 'touch',
	});
});

test('touch with absolute path', () => {
	const result = compileTouch(cmd('touch', [literal('/tmp/file.txt')]));
	expect(result).toEqual({
		args: {
			accessTimeOnly: false,
			files: [literal('/tmp/file.txt')],
			modificationTimeOnly: false,
		},
		cmd: 'touch',
	});
});

test('touch maps access/modify flags into args', () => {
	const result = compileTouch(
		cmd('touch', [literal('-a'), literal('-m'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: {
			accessTimeOnly: true,
			files: [literal('file.txt')],
			modificationTimeOnly: true,
		},
		cmd: 'touch',
	});
});

test('touch with no arguments throws error', () => {
	expect(() => {
		compileTouch(cmd('touch', []));
	}).toThrow('touch requires at least one file');
});

test('touch with only flags throws error', () => {
	expect(() => {
		compileTouch(cmd('touch', [literal('-a'), literal('-m')]));
	}).toThrow('touch requires at least one file');
});
