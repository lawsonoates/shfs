import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { cat } from '@/operator/cat/cat';
import type { FileRecord } from '@/record';

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
