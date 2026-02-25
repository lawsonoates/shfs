import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { collect } from '../../consumer/consumer';
import type { Record as ShellRecord } from '../../record';
import { createBuiltinRuntime } from '../test-runtime';
import { echo } from './echo';

test('echo emits a single joined line', async () => {
	const runtime = createBuiltinRuntime();
	const stream = echo(runtime, {
		values: [literal('hello'), literal('world')],
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'hello world' }]);
	expect(runtime.context.status).toBe(0);
});
