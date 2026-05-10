import { expect, test } from 'bun:test';
import { literal } from '#compiler';
import { echo } from '#shfs/builtin/echo/echo';
import { createBuiltinRuntime } from '#shfs/builtin/test-runtime';
import { collect } from '#shfs/consumer/consumer';
import type { Record as ShellRecord } from '#shfs/record';

test('echo emits a single joined line', async () => {
	const runtime = createBuiltinRuntime();
	const stream = echo(runtime, {
		values: [literal('hello'), literal('world')],
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'hello world' }]);
	expect(runtime.context.status).toBe(0);
});
