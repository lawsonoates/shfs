import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import { MemoryFS } from '#shfs/fs/memory';
import { rm } from '#shfs/operator/rm/rm';

test('rm deletes a file', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';

	fs.setFile(filePath, 'content to be deleted');

	await Effect.runPromise(rm(fs)({ path: filePath, recursive: false }));

	expect(await fs.exists(filePath)).toBe(false);
});

test('rm recursively deletes nested files', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/dir/subdir', true);
	fs.setFile('/dir/root.txt', 'root');
	fs.setFile('/dir/subdir/leaf.txt', 'leaf');

	await Effect.runPromise(rm(fs)({ path: '/dir', recursive: true }));

	expect(await fs.exists('/dir/root.txt')).toBe(false);
	expect(await fs.exists('/dir/subdir/leaf.txt')).toBe(false);
});
