import { expect, test } from 'bun:test';
import { literal } from '#compiler';
import { test as testBuiltin } from '#shfs/builtin/test/test';
import { createBuiltinRuntime } from '#shfs/builtin/test-runtime';
import { collect } from '#shfs/consumer/consumer';
import type { Record as ShellRecord } from '#shfs/record';

test('test sets status for equality success', async () => {
	const runtime = createBuiltinRuntime();
	const stream = testBuiltin(runtime, {
		operands: [literal('a'), literal('='), literal('a')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(0);
});

test('test sets status for equality failure', async () => {
	const runtime = createBuiltinRuntime();
	const stream = testBuiltin(runtime, {
		operands: [literal('a'), literal('='), literal('b')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(1);
});
