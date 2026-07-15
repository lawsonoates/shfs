import { expect, test } from 'bun:test';

import { createShellInput, recordsToShellInput } from '@/execute/io';
import { recordsToBytes, type Record as ShellRecord } from '@/record';

const UTF8_ENCODER = new TextEncoder();

test('readLine leaves the exact unread ByteRecord suffix for records', async () => {
	const unreadSuffix = new Uint8Array([0xfe, 0xff, 0x0a]);
	const input = recordsToShellInput([
		{
			bytes: new Uint8Array([
				...UTF8_ENCODER.encode('first\n'),
				...unreadSuffix,
			]),
			kind: 'bytes',
		},
	]);

	expect(await input.readLine()).toBe('first');
	const remainingRecords: ShellRecord[] = [];
	for await (const record of input.records()) {
		remainingRecords.push(record);
	}
	expect(remainingRecords).toEqual([{ bytes: unreadSuffix, kind: 'bytes' }]);
});

test('lines leaves unread bytes available to bytes', async () => {
	const input = recordsToShellInput([
		{
			bytes: UTF8_ENCODER.encode('first\nsecond\n'),
			kind: 'bytes',
		},
	]);
	const lines = input.lines()[Symbol.asyncIterator]();

	expect(await lines.next()).toEqual({ done: false, value: 'first' });
	expect(await input.bytes()).toEqual(UTF8_ENCODER.encode('second\n'));
});

test('readLine preserves stateful UTF-8 decoding across ByteRecords', async () => {
	const input = recordsToShellInput([
		{ bytes: new Uint8Array([0xc3]), kind: 'bytes' },
		{
			bytes: new Uint8Array([0xbf, 0x0a, 0x6e, 0x65, 0x78, 0x74, 0x0a]),
			kind: 'bytes',
		},
	]);

	expect(await input.readLine()).toBe('ÿ');
	expect(await input.readLine()).toBe('next');
	expect(await input.readLine()).toBeNull();
});

test('readLine retains mixed and explicitly separated records', async () => {
	const explicitRecord = {
		kind: 'line',
		separation: 'explicit',
		text: 'explicit\nvalue',
	} as const;
	const input = recordsToShellInput([
		{ kind: 'line', terminated: false, text: 'mixed ' },
		{ bytes: UTF8_ENCODER.encode('line\nrest\n'), kind: 'bytes' },
		explicitRecord,
	]);

	expect(await input.readLine()).toBe('mixed line');
	expect(await input.readLine()).toBe('rest');
	expect(await input.readLine()).toBe('explicit\nvalue');
	expect(await input.readLine()).toBeNull();
});

test('lineRecords preserve physical termination metadata', async () => {
	const input = recordsToShellInput([
		{ bytes: UTF8_ENCODER.encode('first\nlast'), kind: 'bytes' },
	]);
	const lines = input.lineRecords()[Symbol.asyncIterator]();

	expect(await lines.next()).toEqual({
		done: false,
		value: { kind: 'line', text: 'first' },
	});
	expect(await lines.next()).toEqual({
		done: false,
		value: { kind: 'line', terminated: false, text: 'last' },
	});
	expect(await lines.next()).toEqual({ done: true, value: undefined });
});

test('takePhysicalLines preserves selected bytes and the exact unread suffix', async () => {
	const input = recordsToShellInput([
		{ bytes: new Uint8Array([0xfe]), kind: 'bytes' },
		{
			bytes: new Uint8Array([0xff, 0x0a, 0xfd, 0x0a, 0xfc]),
			kind: 'bytes',
		},
	]);
	const selected: ShellRecord[] = [];
	for await (const record of input.takePhysicalLines(2)) {
		selected.push(record);
	}

	expect(recordsToBytes(selected, { trailingNewline: true })).toEqual(
		new Uint8Array([0xfe, 0xff, 0x0a, 0xfd, 0x0a])
	);
	expect(await input.bytes({ trailingNewline: true })).toEqual(
		new Uint8Array([0xfc])
	);
});

test('takePhysicalLines pushes unread bytes before yielding its cutoff', async () => {
	const input = recordsToShellInput([
		{
			bytes: new Uint8Array([0xfe, 0x0a, 0xff]),
			kind: 'bytes',
		},
	]);
	const selected = input.takePhysicalLines(1)[Symbol.asyncIterator]();

	expect(await selected.next()).toEqual({
		done: false,
		value: { bytes: new Uint8Array([0xfe, 0x0a]), kind: 'bytes' },
	});
	expect(await input.bytes({ trailingNewline: true })).toEqual(
		new Uint8Array([0xff])
	);
	await selected.return?.();
});

test('takePhysicalLines with zero lines does not pull input', async () => {
	let pulls = 0;
	const input = createShellInput(
		(async function* (): AsyncIterable<ShellRecord> {
			pulls++;
			yield { kind: 'line', text: 'first' };
		})()
	);

	for await (const _record of input.takePhysicalLines(0)) {
		throw new Error('head -n 0 must not yield a record');
	}

	expect(pulls).toBe(0);
	expect(await input.readLine()).toBe('first');
	expect(pulls).toBe(1);
});

test('takePhysicalLines formats structured records without decoding lines', async () => {
	const input = recordsToShellInput([
		{ kind: 'json', value: { ok: true } },
		{ kind: 'line', text: 'second' },
		{ displayPath: 'third', kind: 'file', path: '/third' },
	]);
	const selected: ShellRecord[] = [];
	for await (const record of input.takePhysicalLines(2)) {
		selected.push(record);
	}

	expect(selected).toEqual([
		{ kind: 'line', text: '{"ok":true}' },
		{ kind: 'line', text: 'second' },
	]);
	expect(await input.readLine()).toBe('third');
});
