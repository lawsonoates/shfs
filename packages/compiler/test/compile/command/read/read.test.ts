import { expect, test } from 'bun:test';
import { compileRead } from '@/compile/command/read/read';
import { cmd, literal } from '@/ir';

test('read compiles variable target name', () => {
	expect(compileRead(cmd('read', [literal('target')]))).toEqual({
		cmd: 'read',
		args: { name: literal('target') },
	});
});
