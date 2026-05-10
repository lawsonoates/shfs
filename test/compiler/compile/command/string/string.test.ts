import { expect, test } from 'bun:test';
import { compileString } from '#compiler/compile/command/string/string';
import { cmd, literal } from '#compiler/ir';

test('string compiles subcommand and operands', () => {
	expect(
		compileString(
			cmd('string', [
				literal('replace'),
				literal('from'),
				literal('to'),
				literal('input'),
			])
		)
	).toEqual({
		cmd: 'string',
		args: {
			subcommand: literal('replace'),
			operands: [literal('from'), literal('to'), literal('input')],
		},
	});
});
