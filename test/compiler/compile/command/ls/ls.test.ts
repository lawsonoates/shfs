import { expect, test } from 'bun:test';
import { compileLs } from '../../../../../packages/compiler/src/compile/command/ls/ls';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('ls with no arguments defaults to current directory', () => {
	const result = compileLs(cmd('ls', []));
	expect(result).toEqual({
		args: { longFormat: false, paths: [literal('.')], showAll: false },
		cmd: 'ls',
	});
});

test('ls with single path', () => {
	const result = compileLs(cmd('ls', [literal('/tmp')]));
	expect(result).toEqual({
		args: { longFormat: false, paths: [literal('/tmp')], showAll: false },
		cmd: 'ls',
	});
});

test('ls with multiple paths', () => {
	const result = compileLs(
		cmd('ls', [literal('/home'), literal('/tmp'), literal('/var')])
	);
	expect(result).toEqual({
		args: {
			longFormat: false,
			paths: [literal('/home'), literal('/tmp'), literal('/var')],
			showAll: false,
		},
		cmd: 'ls',
	});
});

test('ls with relative path', () => {
	const result = compileLs(cmd('ls', [literal('./src')]));
	expect(result).toEqual({
		args: { longFormat: false, paths: [literal('./src')], showAll: false },
		cmd: 'ls',
	});
});

test('ls with -a and -l flags', () => {
	const result = compileLs(
		cmd('ls', [literal('-a'), literal('-l'), literal('/tmp')])
	);
	expect(result).toEqual({
		args: { longFormat: true, paths: [literal('/tmp')], showAll: true },
		cmd: 'ls',
	});
});
