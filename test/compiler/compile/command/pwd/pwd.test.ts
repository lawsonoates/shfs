import { expect, test } from 'bun:test';
import { compilePwd } from '../../../../../packages/compiler/src/compile/command/pwd/pwd';
import { cmd, literal } from '../../../../../packages/compiler/src/ir';

test('pwd with no arguments', () => {
	const result = compilePwd(cmd('pwd', []));
	expect(result).toEqual({
		args: {},
		cmd: 'pwd',
	});
});

test('pwd with positional argument throws error', () => {
	expect(() => {
		compilePwd(cmd('pwd', [literal('/tmp')]));
	}).toThrow('pwd does not take any arguments');
});

test('pwd with option throws error', () => {
	expect(() => {
		compilePwd(cmd('pwd', [literal('-L')]));
	}).toThrow('pwd does not take any arguments');
});
