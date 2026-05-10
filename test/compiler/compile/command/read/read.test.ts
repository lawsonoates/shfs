import { expect, test } from 'bun:test';
import { compileRead } from '../../../../../packages/compiler/src/compile/command/read/read';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('read compiles variable target name', () => {
	expect(compileRead(cmd('read', [literal('target')]))).toEqual({
		cmd: 'read',
		args: { name: literal('target') },
	});
});
