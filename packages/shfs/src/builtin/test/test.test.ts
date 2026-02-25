import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { collect } from '../../consumer/consumer';
import type { Record as ShellRecord } from '../../record';
import { createBuiltinRuntime } from '../test-runtime';
import { test as testBuiltin } from './test';

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
