import { expect, test } from 'bun:test';
import { literal } from '../../../../packages/compiler/src';
import { string } from '../../../../packages/shfs/src/builtin/string/string';
import { createBuiltinRuntime } from '../../../../packages/shfs/src/builtin/test-runtime';
import { collect } from '../../../../packages/shfs/src/consumer/consumer';
import type { Record as ShellRecord } from '../../../../packages/shfs/src/record';

async function* emptyInput(): AsyncIterable<ShellRecord> {
	// no records
}

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

test('string match with empty stdin returns non-match status', async () => {
	const runtime = createBuiltinRuntime({ input: emptyInput() });
	const stream = string(runtime, {
		operands: [literal('a*')],
		subcommand: literal('match'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([]);
	expect(runtime.context.status).toBe(1);
});
