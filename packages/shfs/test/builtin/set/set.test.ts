import { expect, test } from 'bun:test';
import { literal } from '@shfs/compiler';
import { set } from '@/builtin/set/set';
import { createBuiltinRuntime } from '@/builtin/test-runtime';
import { collect } from '@/consumer/consumer';
import type { Record as ShellRecord } from '@/record';

test('set writes global variables', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		append: false,
		mode: 'assign',
		names: [literal('NAME')],
		prepend: false,
		scope: 'global',
		values: [literal('value')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.globalVars.get('NAME')).toEqual(['value']);
	expect(runtime.context.status).toBe(0);
});

test('set stores multiple values as a list', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		append: false,
		mode: 'assign',
		names: [literal('PAIR')],
		prepend: false,
		scope: 'global',
		values: [literal('a'), literal('b')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.globalVars.get('PAIR')).toEqual(['a', 'b']);
});

test('set -a appends to an existing list', async () => {
	const runtime = createBuiltinRuntime();
	runtime.context.globalVars.set('ACC', ['one']);
	const stream = set(runtime, {
		append: true,
		mode: 'assign',
		names: [literal('ACC')],
		prepend: false,
		scope: 'global',
		values: [literal('two'), literal('three')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.globalVars.get('ACC')).toEqual([
		'one',
		'two',
		'three',
	]);
});

test('set -p prepends to an existing list', async () => {
	const runtime = createBuiltinRuntime();
	runtime.context.globalVars.set('ACC', ['three']);
	const stream = set(runtime, {
		append: false,
		mode: 'assign',
		names: [literal('ACC')],
		prepend: true,
		scope: 'global',
		values: [literal('one'), literal('two')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.globalVars.get('ACC')).toEqual([
		'one',
		'two',
		'three',
	]);
});

test('set refuses to change the read-only status variable', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		append: false,
		mode: 'assign',
		names: [literal('status')],
		prepend: false,
		scope: 'global',
		values: [literal('5')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(1);
	expect(runtime.context.stderr.snapshot().join('\n')).toContain(
		"set: Tried to change the read-only variable 'status'"
	);
});

test('set validates variable names', async () => {
	const runtime = createBuiltinRuntime();
	const stream = set(runtime, {
		append: false,
		mode: 'assign',
		names: [literal('1bad')],
		prepend: false,
		scope: 'local',
		values: [literal('value')],
	});

	await collect<ShellRecord>()(stream);

	expect(runtime.context.status).toBe(1);
	expect(runtime.context.stderr.snapshot().join('\n')).toContain(
		'set: invalid variable name: 1bad'
	);
});
