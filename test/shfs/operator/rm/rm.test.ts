import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { rm } from '#shfs/operator/rm/rm';

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

test('rm recursively deletes nested files', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/dir/subdir', true);
	fs.setFile('/dir/root.txt', 'root');
	fs.setFile('/dir/subdir/leaf.txt', 'leaf');

	await rm(fs)({ path: '/dir', recursive: true });

	expect(await fs.exists('/dir/root.txt')).toBe(false);
	expect(await fs.exists('/dir/subdir/leaf.txt')).toBe(false);
});
