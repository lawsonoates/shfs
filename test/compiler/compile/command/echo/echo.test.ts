import { expect, test } from 'bun:test';
import { compileEcho } from '#compiler/compile/command/echo/echo';
import { cmd, literal } from '#compiler/ir';

test('echo maps positional args into values', () => {
	expect(compileEcho(cmd('echo', [literal('a'), literal('b')]))).toEqual({
		cmd: 'echo',
		args: { values: [literal('a'), literal('b')] },
	});
});
