import { expect, test } from 'bun:test';

import {
	type ByteRecord,
	byteRecordToLineRecords,
	formatRecords,
	recordsToBytes,
} from '@/record';

test('byte records serialize empty chunks and physical line endings exactly', () => {
	const records: ByteRecord[] = [
		{ bytes: new Uint8Array(), kind: 'bytes' },
		{ bytes: new Uint8Array([0x61, 0x0a, 0x0a, 0x62]), kind: 'bytes' },
	];

	expect(recordsToBytes(records, { trailingNewline: true })).toEqual(
		new Uint8Array([0x61, 0x0a, 0x0a, 0x62])
	);
	expect(formatRecords(records)).toBe('a\n\nb');
});

test('byte records trim only one final LF for display serialization', () => {
	const records: ByteRecord[] = [
		{ bytes: new Uint8Array([0x61, 0x0a, 0x0a]), kind: 'bytes' },
	];

	expect(recordsToBytes(records)).toEqual(new Uint8Array([0x61, 0x0a]));
	expect(recordsToBytes(records, { trailingNewline: true })).toEqual(
		new Uint8Array([0x61, 0x0a, 0x0a])
	);
});

test('byte records become deterministic UTF-8 physical lines', () => {
	expect(
		byteRecordToLineRecords({
			bytes: new Uint8Array([0x61, 0x0a, 0x0a, 0xff, 0x62]),
			kind: 'bytes',
		})
	).toEqual([
		{ kind: 'line', text: 'a' },
		{ kind: 'line', text: '' },
		{ kind: 'line', terminated: false, text: '\ufffdb' },
	]);
});
