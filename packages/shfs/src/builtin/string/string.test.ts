import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { collect } from '../../consumer/consumer';
import type { Record as ShellRecord } from '../../record';
import { createBuiltinRuntime } from '../test-runtime';
import { string } from './string';

test('string replace emits replaced value', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [literal('fish'), literal('cat'), literal('fish shell')],
		subcommand: literal('replace'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'cat shell' }]);
	expect(runtime.context.status).toBe(0);
});

test('string match -q sets failure status without output', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [literal('-q'), literal('a*'), literal('beta')],
		subcommand: literal('match'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([]);
	expect(runtime.context.status).toBe(1);
});
