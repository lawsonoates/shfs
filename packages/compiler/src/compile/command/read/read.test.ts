import { expect, test } from 'bun:test';

import { cmd, literal } from '@/ir';
import { compileRead } from './read';

test('read compiles variable target name', () => {
	expect(compileRead(cmd('read', [literal('target')]))).toEqual({
		cmd: 'read',
		args: { name: literal('target') },
	});
});
