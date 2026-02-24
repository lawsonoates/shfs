import { expect, test } from 'bun:test';

import { cmd, literal } from '@/ir';
import { compileEcho } from './echo';

test('echo maps positional args into values', () => {
	expect(compileEcho(cmd('echo', [literal('a'), literal('b')]))).toEqual({
		cmd: 'echo',
		args: { values: [literal('a'), literal('b')] },
	});
});
