import { expect, test } from 'bun:test';

import { recordsToShellInput } from '@/execute/io';
import type { Record as ShellRecord } from '@/record';

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
