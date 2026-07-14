import { expect, test } from 'bun:test';

import {
	type ByteRecord,
	formatRecords,
	recordsToBytes,
	type Record as ShellRecord,
	toPhysicalLineRecords,
} from '@/record';

async function decodePhysicalLines(
	records: readonly ShellRecord[]
): Promise<ShellRecord[]> {
	const input = (async function* () {
		yield* records;
	})();
	const lines: ShellRecord[] = [];
	for await (const line of toPhysicalLineRecords(input)) {
		lines.push(line);
	}
	return lines;
}

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

test('display serialization trims logical LF but preserves byte-owned LF', () => {
	const byteRecords: ByteRecord[] = [
		{ bytes: new Uint8Array([0x61, 0x0a, 0x0a]), kind: 'bytes' },
	];
	const lineRecords = [
		{ kind: 'line', text: 'a' },
		{ kind: 'line', text: '' },
	] as const;

	expect(recordsToBytes(byteRecords)).toEqual(
		new Uint8Array([0x61, 0x0a, 0x0a])
	);
	expect(recordsToBytes(lineRecords)).toEqual(new Uint8Array([0x61, 0x0a]));
	expect(recordsToBytes(lineRecords, { trailingNewline: true })).toEqual(
		new Uint8Array([0x61, 0x0a, 0x0a])
	);
});

test('byte records become deterministic UTF-8 physical lines', async () => {
	expect(
		await decodePhysicalLines([
			{
				bytes: new Uint8Array([0x61, 0x0a, 0x0a, 0xff, 0x62]),
				kind: 'bytes',
			},
		])
	).toEqual([
		{ kind: 'line', text: 'a' },
		{ kind: 'line', text: '' },
		{ kind: 'line', terminated: false, text: '\ufffdb' },
	]);
});

test('physical line decoding spans byte record boundaries', async () => {
	expect(
		await decodePhysicalLines([
			{ bytes: new Uint8Array([0x61]), kind: 'bytes' },
			{ bytes: new Uint8Array([0x62, 0x0a]), kind: 'bytes' },
			{ bytes: new Uint8Array([0x63, 0x0a]), kind: 'bytes' },
			{ bytes: new Uint8Array([0x64]), kind: 'bytes' },
		])
	).toEqual([
		{ kind: 'line', text: 'ab' },
		{ kind: 'line', text: 'c' },
		{ kind: 'line', terminated: false, text: 'd' },
	]);

	expect(
		await decodePhysicalLines([
			{ bytes: new Uint8Array([0xc3]), kind: 'bytes' },
			{ bytes: new Uint8Array([0xbf, 0x0a]), kind: 'bytes' },
		])
	).toEqual([{ kind: 'line', text: 'ÿ' }]);
});

test('physical line decoding spans byte and logical line records', async () => {
	expect(
		await decodePhysicalLines([
			{ bytes: new Uint8Array([0x61]), kind: 'bytes' },
			{ kind: 'line', text: 'b' },
			{ kind: 'line', terminated: false, text: 'c' },
			{ bytes: new Uint8Array([0x64, 0x0a]), kind: 'bytes' },
			{ kind: 'line', text: 'e' },
			{ bytes: new Uint8Array([0x66]), kind: 'bytes' },
		])
	).toEqual([
		{ kind: 'line', text: 'ab' },
		{ kind: 'line', text: 'cd' },
		{ kind: 'line', text: 'e' },
		{ kind: 'line', terminated: false, text: 'f' },
	]);
});

test('physical line decoding preserves explicit logical boundaries', async () => {
	expect(
		await decodePhysicalLines([
			{ bytes: new Uint8Array([0x61]), kind: 'bytes' },
			{ kind: 'line', separation: 'explicit', text: 'b' },
			{ kind: 'line', separation: 'explicit', text: 'c' },
		])
	).toEqual([
		{ kind: 'line', terminated: false, text: 'a' },
		{ kind: 'line', separation: 'explicit', text: 'b' },
		{ kind: 'line', separation: 'explicit', text: 'c' },
	]);
});
