import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import type { FileRecord } from '../../record';
import { rm } from './rm';

test('rm deletes files', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';

	fs.setFile(filePath, 'content to be deleted');

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: filePath };
	}

	const sink = rm(fs);
	await sink(createFileStream());

	// Verify file is deleted by attempting to read it and catching the error
	try {
		await fs.readFile(filePath);
		expect.unreachable('File should have been deleted');
	} catch (error) {
		expect((error as Error).message).toContain('File not found');
	}
});
