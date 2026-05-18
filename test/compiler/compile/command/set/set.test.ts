import { expect, test } from 'bun:test';
import { compileSet } from '#compiler/compile/command/set/set';
import { cmd, literal } from '#compiler/ir';

test('set compiles global assignment', () => {
	expect(
		compileSet(
			cmd('set', [
				literal('-g'),
				literal('PROJECT_ROOT'),
				literal('/tmp'),
			])
		)
	).toEqual({
		cmd: 'set',
		args: {
			scope: 'global',
			name: literal('PROJECT_ROOT'),
			values: [literal('/tmp')],
		},
	});
});

test('set compiles local assignment', () => {
	expect(
		compileSet(cmd('set', [literal('-l'), literal('LOCAL'), literal('x')]))
	).toEqual({
		cmd: 'set',
		args: {
			scope: 'local',
			name: literal('LOCAL'),
			values: [literal('x')],
		},
	});
});
