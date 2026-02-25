import { expect, test } from 'bun:test';

import { cmd, literal } from '@/ir';
import { compileString } from './string';

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
