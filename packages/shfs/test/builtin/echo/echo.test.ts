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

// fish-shell src/builtins/echo.rs: -s removes argument separators.
test('echo -s joins arguments without spaces', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		echo(runtime, {
			values: [literal('-s'), literal('hello'), literal('world')],
		})
	);

	expect(records).toEqual([{ kind: 'line', text: 'helloworld' }]);
	expect(runtime.context.status).toBe(0);
});

// fish-shell src/builtins/echo.rs: later -e/-E flags override earlier ones.
test('echo applies escape-mode options in order', async () => {
	const enabled = createBuiltinRuntime();
	const on = await collect<ShellRecord>()(
		echo(enabled, {
			values: [literal('-E'), literal('-e'), literal('a\\nb')],
		})
	);
	const disabled = createBuiltinRuntime();
	const off = await collect<ShellRecord>()(
		echo(disabled, {
			values: [literal('-e'), literal('-E'), literal('a\\nb')],
		})
	);

	expect(on).toEqual([{ kind: 'line', text: 'a\nb' }]);
	expect(off).toEqual([{ kind: 'line', text: 'a\\nb' }]);
});
