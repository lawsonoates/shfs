import { expect, test } from 'bun:test';
import { compileCd } from '@/compile/command/cd/cd';
import { cmd, literal } from '@/ir';

test('cd with no arguments defaults to root', () => {
	const result = compileCd(cmd('cd', []));
	expect(result).toEqual({
		args: { path: literal('/') },
		cmd: 'cd',
	});
});

test('cd with single path argument', () => {
	const result = compileCd(cmd('cd', [literal('/workspace')]));
	expect(result).toEqual({
		args: { path: literal('/workspace') },
		cmd: 'cd',
	});
});

test('cd with relative path argument', () => {
	const result = compileCd(cmd('cd', [literal('project')]));
	expect(result).toEqual({
		args: { path: literal('project') },
		cmd: 'cd',
	});
});

test('cd treats -- as option separator for path arguments', () => {
	const result = compileCd(cmd('cd', [literal('--'), literal('-target')]));
	expect(result).toEqual({
		args: { path: literal('-target') },
		cmd: 'cd',
	});
});

test('cd with multiple arguments throws error', () => {
	expect(() => {
		compileCd(cmd('cd', [literal('/tmp'), literal('/var')]));
	}).toThrow('cd accepts at most one path');
});

test('cd with -- and multiple path arguments throws error', () => {
	expect(() => {
		compileCd(cmd('cd', [literal('--'), literal('/tmp'), literal('/var')]));
	}).toThrow('cd accepts at most one path');
});
