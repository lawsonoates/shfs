import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { collect } from '../../consumer/consumer';
import type { Record as ShellRecord } from '../../record';
import type { Stream } from '../../stream';
import { createBuiltinRuntime } from '../test-runtime';
import { read } from './read';

async function* inputStream(): Stream<ShellRecord> {
	yield { kind: 'line', text: 'first' };
	yield { kind: 'line', text: 'second' };
}

test('read stores first value from stream into local vars', async () => {
	const runtime = createBuiltinRuntime({ input: inputStream() });
	const stream = read(runtime, { name: literal('value') });

	await collect<ShellRecord>()(stream);

	expect(runtime.context.localVars.get('value')).toBe('first');
	expect(runtime.context.status).toBe(0);
});

test('read reports failure when there is no input', async () => {
	const runtime = createBuiltinRuntime({ input: null });
	const stream = read(runtime, { name: literal('value') });

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(1);
});
