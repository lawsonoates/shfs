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

// fish string-replace.rst: capture references and dollar escapes are regex-only;
// the literal path copies replacement text verbatim.
test('string replace keeps literal replacement tokens unchanged', async () => {
	const cases = [
		{ expected: '$&', operands: ['a', '$&', 'a'] },
		{ expected: '$1', operands: ['a', '$1', 'a'] },
		{ expected: '$$', operands: ['a', '$$', 'a'] },
		{ expected: '$&$&', operands: ['-a', 'a', '$&', 'aa'] },
	] as const;

	for (const { expected, operands } of cases) {
		const runtime = createBuiltinRuntime();
		const records = await collect<ShellRecord>()(
			string(runtime, {
				operands: operands.map((operand) => literal(operand)),
				subcommand: literal('replace'),
			})
		);

		expect(records).toEqual([{ kind: 'line', text: expected }]);
		expect(runtime.context.status).toBe(0);
	}
});

// fish src/builtins/string/replace.rs: an empty literal pattern is a no-op.
test('string replace ignores an empty literal pattern', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [literal(''), literal('x'), literal('plain')],
			subcommand: literal('replace'),
		})
	);

	expect(records).toEqual([{ kind: 'line', text: 'plain' }]);
	expect(runtime.context.status).toBe(1);
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

// fish string-match.rst: regex output has one item for the full match and
// one for each capture group, including an unmatched optional capture.
test('string match preserves unmatched capture positions', async () => {
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [literal('-r'), literal('(a)?(b)'), literal('b')],
			subcommand: literal('match'),
		})
	);

	expect(records).toEqual([
		{ kind: 'line', text: 'b' },
		{ kind: 'line', text: '' },
		{ kind: 'line', text: 'b' },
	]);
	expect(runtime.context.status).toBe(0);
});

// fish doc_src/cmds/string.rst:329-344: regex mode supports the complete
// documented POSIX named-class table and its [[:^xxx:]] inverse form.
test('string match supports documented POSIX character classes', async () => {
	const cases = [
		{ member: 'A', name: 'alnum', nonmember: '!' },
		{ member: 'A', name: 'alpha', nonmember: '7' },
		{ member: 'A', name: 'ascii', nonmember: 'é' },
		{ member: '\t', name: 'blank', nonmember: 'A' },
		{ member: '\x07', name: 'cntrl', nonmember: 'A' },
		{ member: '7', name: 'digit', nonmember: 'A' },
		{ member: '!', name: 'graph', nonmember: ' ' },
		{ member: 'a', name: 'lower', nonmember: 'A' },
		{ member: ' ', name: 'print', nonmember: '\x07' },
		{ member: '!', name: 'punct', nonmember: 'A' },
		{ member: '\t', name: 'space', nonmember: 'A' },
		{ member: 'A', name: 'upper', nonmember: 'a' },
		{ member: '_', name: 'word', nonmember: '-' },
		{ member: 'F', name: 'xdigit', nonmember: 'G' },
	] as const;

	for (const { member, name, nonmember } of cases) {
		for (const [pattern, value, expectedStatus] of [
			[`^[[:${name}:]]$`, member, 0],
			[`^[[:${name}:]]$`, nonmember, 1],
			[`^[[:^${name}:]]$`, nonmember, 0],
			[`^[[:^${name}:]]$`, member, 1],
		] as const) {
			const runtime = createBuiltinRuntime();
			const records = await collect<ShellRecord>()(
				string(runtime, {
					operands: [literal('-r'), literal(pattern), literal(value)],
					subcommand: literal('match'),
				})
			);

			expect(records).toEqual(
				expectedStatus === 0 ? [{ kind: 'line', text: value }] : []
			);
			expect(runtime.context.status).toBe(expectedStatus);
		}
	}
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

// fish string-replace.rst: $n and ${n} accept the full numeric capture index.
test('string replace greedily expands multi-digit capture references', async () => {
	const pattern = '(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)';
	const runtime = createBuiltinRuntime();
	const records = await collect<ShellRecord>()(
		string(runtime, {
			operands: [
				literal('-r'),
				literal(pattern),
				literal(`$10:${'$'}{10}`),
				literal('abcdefghij'),
			],
			subcommand: literal('replace'),
		})
	);

	expect(records).toEqual([{ kind: 'line', text: 'j:j' }]);
	expect(runtime.context.status).toBe(0);

	for (const reference of ['$11', `${'$'}{11}`]) {
		const invalidRuntime = createBuiltinRuntime();
		const invalidRecords = await collect<ShellRecord>()(
			string(invalidRuntime, {
				operands: [
					literal('-r'),
					literal(pattern),
					literal(reference),
					literal('abcdefghij'),
				],
				subcommand: literal('replace'),
			})
		);

		expect(invalidRecords).toEqual([]);
		expect(invalidRuntime.context.status).toBe(2);
		expect(invalidRuntime.context.stderr.snapshot().join('\n')).toContain(
			'unknown substring'
		);
	}
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
