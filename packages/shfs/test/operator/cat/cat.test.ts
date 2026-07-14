import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { cat } from '@/operator/cat/cat';
import type { FileRecord, Record as ShellRecord } from '@/record';

test('cat reads file and yields lines', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';
	const fileContent = 'line1\nline2\nline3';

	fs.setFile(filePath, fileContent);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: filePath };
	}

	const lines: string[] = [];
	const transducer = cat(fs);
	for await (const record of transducer(createFileStream())) {
		if (record.kind === 'line') {
			lines.push(record.text);
		}
	}

	expect(lines).toEqual(['line1', 'line2', 'line3']);
	expect(lines[0]).toBe('line1');
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
