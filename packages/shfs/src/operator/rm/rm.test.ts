import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { rm } from './rm';

test('rm deletes a file', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';

	fs.setFile(filePath, 'content to be deleted');

	await rm(fs)({ path: filePath, recursive: false });

	// Verify file is deleted by attempting to read it and catching the error
	try {
		await fs.readFile(filePath);
		expect.unreachable('File should have been deleted');
	} catch (error) {
		expect((error as Error).message).toContain('File not found');
	}
});
