import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { string } from '@/builtin/string/string';
import { createBuiltinRuntime } from '@/builtin/test-runtime';
import { collect } from '@/consumer/consumer';
import type { Record as ShellRecord } from '@/record';

async function* emptyInput(): AsyncIterable<ShellRecord> {
	// no records
}

async function* nulInput(): AsyncIterable<ShellRecord> {
	yield {
		kind: 'line',
		terminated: false,
		text: 'left\0middle\0right',
	};
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

test('string regex replacement emits one record per physical output line', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [
				literal('-r'),
				literal('x'),
				literal('\\n'),
				literal('axb'),
			],
			subcommand: literal('replace'),
		})
	);

	expect(records).toEqual([
		{ kind: 'line', text: 'a' },
		{ kind: 'line', text: 'b' },
	]);
	expect(runtime.context.status).toBe(0);

	const captureRuntime = createBuiltinRuntime();
	const captureRecords = await collect<ShellRecord>()(
		string(captureRuntime, {
			operands: [
				literal('-r'),
				literal('([\\s\\S]+)'),
				literal('$1'),
				literal('a\nb'),
			],
			subcommand: literal('replace'),
		})
	);
	expect(captureRecords).toEqual([
		{ kind: 'line', text: 'a' },
		{ kind: 'line', text: 'b' },
	]);
	expect(captureRuntime.context.status).toBe(0);
});

// fish string-replace.rst: numeric captures accept ${n} references.
test('string replace expands braced numeric capture references', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [
				literal('-r'),
				literal('(a)(b)'),
				literal(`${'$'}{2}${'$'}{1}`),
				literal('ab'),
			],
			subcommand: literal('replace'),
		})
	);

	expect(records).toEqual([{ kind: 'line', text: 'ba' }]);
	expect(runtime.context.status).toBe(0);
});

// fish string-split.rst: split0 accepts direct strings.
test('string split0 accepts direct string operands', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [literal('plain')],
			subcommand: literal('split0'),
		})
	);

	expect(records).toEqual([
		{ kind: 'line', separation: 'explicit', text: 'plain' },
	]);
	expect(runtime.context.status).toBe(1);
});

// fish string-split.rst: split0 shares split's max/right options.
test('string split0 applies max splits from the right', async () => {
	const runtime = createBuiltinRuntime({ input: nulInput() });
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [literal('-r'), literal('-m1')],
			subcommand: literal('split0'),
		})
	);

	expect(records).toEqual([
		{
			kind: 'line',
			separation: 'explicit',
			text: 'left\0middle',
		},
		{ kind: 'line', separation: 'explicit', text: 'right' },
	]);
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

test('string lower lowercases each value', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [literal('AbC'), literal('DEF')],
		subcommand: literal('lower'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([
		{ kind: 'line', text: 'abc' },
		{ kind: 'line', text: 'def' },
	]);
	expect(runtime.context.status).toBe(0);
});

test('string upper uppercases each value', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [literal('AbC')],
		subcommand: literal('upper'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'ABC' }]);
	expect(runtime.context.status).toBe(0);
});

test('string lower reports status 1 when nothing changes', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [literal('abc')],
		subcommand: literal('lower'),
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([{ kind: 'line', text: 'abc' }]);
	expect(runtime.context.status).toBe(1);
});

test('string with a null subcommand reports a usage error', async () => {
	const runtime = createBuiltinRuntime();
	const stream = string(runtime, {
		operands: [],
		subcommand: null,
	});
	const records = await collect<ShellRecord>()(stream);

	expect(records).toEqual([]);
	expect(runtime.context.status).toBe(2);
	expect(runtime.context.stderr.snapshot().join('\n')).toContain(
		'string: missing subcommand'
	);
});
