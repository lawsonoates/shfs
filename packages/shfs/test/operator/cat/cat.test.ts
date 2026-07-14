import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { cat } from '@/operator/cat/cat';
import {
	type FileRecord,
	recordsToBytes,
	type Record as ShellRecord,
} from '@/record';

const textDecoder = new TextDecoder();

test('cat replays file bytes', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';
	const fileContent = 'line1\nline2\nline3';

	fs.setFile(filePath, fileContent);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: filePath };
	}

	const records: ShellRecord[] = [];
	const transducer = cat(fs);
	for await (const record of transducer(createFileStream())) {
		records.push(record);
	}

	expect(
		textDecoder.decode(recordsToBytes(records, { trailingNewline: true }))
	).toBe(fileContent);
});

test('cat transforms physical lines across byte record boundaries', async () => {
	const fs = new MemoryFS();
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield { bytes: new Uint8Array([0x61]), kind: 'bytes' };
		yield { bytes: new Uint8Array([0x62, 0x0a]), kind: 'bytes' };
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(records).toEqual([{ kind: 'line', text: 'ab$' }]);
});

test('cat decodes invalid file bytes only when line transforms require text', async () => {
	const fs = new MemoryFS();
	fs.setFile('/raw.bin', new Uint8Array([0xfe]));
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield { kind: 'file', path: '/raw.bin' };
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(records).toEqual([
		{
			file: '/raw.bin',
			kind: 'line',
			lineNum: 1,
			terminated: false,
			text: '\ufffd$',
		},
	]);
});
