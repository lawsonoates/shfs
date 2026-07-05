import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { rm } from '@/operator/rm/rm';

test('rm deletes a file', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';

	fs.setFile(filePath, 'content to be deleted');

	(await rm(fs)({ path: filePath, recursive: false })).unwrap();

	expect(await fs.exists(filePath)).toBe(false);
});

test('rm recursively deletes nested files', async () => {
	const fs = new MemoryFS();
	await fs.makeDirectory('/dir/subdir', { recursive: true });
	fs.setFile('/dir/root.txt', 'root');
	fs.setFile('/dir/subdir/leaf.txt', 'leaf');

	(await rm(fs)({ path: '/dir', recursive: true })).unwrap();

	expect(await fs.exists('/dir/root.txt')).toBe(false);
	expect(await fs.exists('/dir/subdir/leaf.txt')).toBe(false);
});
