import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { echo } from '@/builtin/echo/echo';
import { createBuiltinRuntime } from '@/builtin/test-runtime';
import { collect } from '@/consumer/consumer';
import type { Record as ShellRecord } from '@/record';

test('echo emits a single joined line', async () => {
	const runtime = createBuiltinRuntime();
	const stream = echo(runtime, {
		values: [literal('hello'), literal('world')],
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'hello world' }]);
	expect(runtime.context.status).toBe(0);
});
