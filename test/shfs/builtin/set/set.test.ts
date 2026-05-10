import { expect, test } from 'bun:test';
import { literal } from '../../../../packages/compiler/src';
import { set } from '../../../../packages/shfs/src/builtin/set/set';
import { createBuiltinRuntime } from '../../../../packages/shfs/src/builtin/test-runtime';
import { collect } from '../../../../packages/shfs/src/consumer/consumer';
import type { Record as ShellRecord } from '../../../../packages/shfs/src/record';

test('set writes global variables', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		name: literal('NAME'),
		scope: 'global',
		values: [literal('value')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.globalVars.get('NAME')).toBe('value');
	expect(runtime.context.status).toBe(0);
});

test('set validates variable names', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		name: literal('1bad'),
		scope: 'local',
		values: [literal('value')],
	});

	await expect(collect<ShellRecord>()(stream)).rejects.toThrow(
		'set: invalid variable name: 1bad'
	);
});
