import { expect, test } from 'bun:test';

import { compileLs } from './ls';

test('ls with no arguments defaults to current directory', () => {
	const result = compileLs({ args: [], name: 'ls' });
	expect(result).toEqual({
		args: { paths: ['.'] },
		cmd: 'ls',
	});
});

test('ls with single path', () => {
	const result = compileLs({ args: ['/tmp'], name: 'ls' });
	expect(result).toEqual({
		args: { paths: ['/tmp'] },
		cmd: 'ls',
	});
});

test('ls with multiple paths', () => {
	const result = compileLs({ args: ['/home', '/tmp', '/var'], name: 'ls' });
	expect(result).toEqual({
		args: { paths: ['/home', '/tmp', '/var'] },
		cmd: 'ls',
	});
});

test('ls with relative path', () => {
	const result = compileLs({ args: ['./src'], name: 'ls' });
	expect(result).toEqual({
		args: { paths: ['./src'] },
		cmd: 'ls',
	});
});
