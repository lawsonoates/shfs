import { expect, test } from 'bun:test';

import { compilePwd } from './pwd';

test('pwd with no arguments', () => {
	const result = compilePwd({ args: [], name: 'pwd' });
	expect(result).toEqual({
		args: {},
		cmd: 'pwd',
	});
});

test('pwd ignores any arguments', () => {
	const result = compilePwd({ args: ['some', 'args'], name: 'pwd' });
	expect(result).toEqual({
		args: {},
		cmd: 'pwd',
	});
});
