import { expect, test } from 'bun:test';
import { literal } from '#compiler';
import { read } from '#shfs/builtin/read/read';
import { createBuiltinRuntime } from '#shfs/builtin/test-runtime';
import { collect } from '#shfs/consumer/consumer';
import type { Record as ShellRecord } from '#shfs/record';
import type { Stream } from '#shfs/stream';

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

test('read stores formatted file records instead of reading file contents', async () => {
	async function* fileInput(): Stream<ShellRecord> {
		yield { kind: 'file', path: '/workspace/value.txt' };
	}
	const runtime = createBuiltinRuntime({ input: fileInput() });
	const stream = read(runtime, { name: literal('value') });

	await collect<ShellRecord>()(stream);

	expect(runtime.context.localVars.get('value')).toBe('/workspace/value.txt');
	expect(runtime.context.status).toBe(0);
});

test('read reports failure when there is no input', async () => {
	const runtime = createBuiltinRuntime({ input: null });
	const stream = read(runtime, { name: literal('value') });

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(1);
});
