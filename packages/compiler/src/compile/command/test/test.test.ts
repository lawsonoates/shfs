import { expect, test } from 'bun:test';

import { cmd, literal } from '@/ir';
import { compileTest } from './test';

test('test compiles operands', () => {
	expect(
		compileTest(cmd('test', [literal('1'), literal('='), literal('1')]))
	).toEqual({
		cmd: 'test',
		args: { operands: [literal('1'), literal('='), literal('1')] },
	});
});
