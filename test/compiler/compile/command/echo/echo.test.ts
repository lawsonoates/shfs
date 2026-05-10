import { expect, test } from 'bun:test';
import { compileEcho } from '../../../../../packages/compiler/src/compile/command/echo/echo';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('echo maps positional args into values', () => {
	expect(compileEcho(cmd('echo', [literal('a'), literal('b')]))).toEqual({
		cmd: 'echo',
		args: { values: [literal('a'), literal('b')] },
	});
});
