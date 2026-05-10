import { expect, test } from 'bun:test';
import { literal } from '../../../../packages/compiler/src';
import { echo } from '../../../../packages/shfs/src/builtin/echo/echo';
import { createBuiltinRuntime } from '../../../../packages/shfs/src/builtin/test-runtime';
import { collect } from '../../../../packages/shfs/src/consumer/consumer';
import type { Record as ShellRecord } from '../../../../packages/shfs/src/record';

test('echo emits a single joined line', async () => {
	const runtime = createBuiltinRuntime();
	const stream = echo(runtime, {
		values: [literal('hello'), literal('world')],
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'hello world' }]);
	expect(runtime.context.status).toBe(0);
});
