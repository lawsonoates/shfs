import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import { MemoryFS } from '#shfs/fs/memory';
import { mkdir } from '#shfs/operator/mkdir/mkdir';

test('mkdir creates single directory', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await Effect.runPromise(effect({ path: '/newdir', recursive: false }));

	// Verify by trying to stat it
	const stat = await fs.stat('/newdir');
	expect(stat.isDirectory).toBe(true);
});

test('mkdir with recursive flag creates nested directories', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await Effect.runPromise(effect({ path: '/a/b/c', recursive: true }));

	const stat = await fs.stat('/a/b/c');
	expect(stat.isDirectory).toBe(true);
});

test('mkdir without recursive flag fails if parent does not exist', async () => {
	const fs = new MemoryFS();
	const effect = mkdir(fs);

	await expect(
		Effect.runPromise(effect({ path: '/parent/child', recursive: false }))
	).rejects.toThrow('No such file or directory');
});

test('mkdir fails if directory already exists', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await Effect.runPromise(effect({ path: '/dir', recursive: false }));

	await expect(
		Effect.runPromise(effect({ path: '/dir', recursive: false }))
	).rejects.toThrow('already exists');
});
