import { expect, test } from 'bun:test';
import { compileTest } from '#compiler/compile/command/test/test';
import { cmd, literal } from '#compiler/ir';

test('test compiles operands', () => {
	expect(
		compileTest(cmd('test', [literal('1'), literal('='), literal('1')]))
	).toEqual({
		cmd: 'test',
		args: { operands: [literal('1'), literal('='), literal('1')] },
	});
});
