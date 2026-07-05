import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { mkdir } from '#shfs/operator/mkdir/mkdir';

test('mkdir creates single directory', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	(await effect({ path: '/newdir', recursive: false })).unwrap();

	// Verify by trying to stat it
	const stat = await fs.stat('/newdir');
	expect(stat.type === 'Directory').toBe(true);
});

test('mkdir with recursive flag creates nested directories', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	(await effect({ path: '/a/b/c', recursive: true })).unwrap();

	const stat = await fs.stat('/a/b/c');
	expect(stat.type === 'Directory').toBe(true);
});

test('mkdir without recursive flag fails if parent does not exist', async () => {
	const fs = new MemoryFS();
	const effect = mkdir(fs);

	await expect(
		effect({ path: '/parent/child', recursive: false }).then((result) =>
			result.unwrap()
		)
	).rejects.toThrow('No such file or directory');
});

test('mkdir fails if directory already exists', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	(await effect({ path: '/dir', recursive: false })).unwrap();

	await expect(
		effect({ path: '/dir', recursive: false }).then((result) =>
			result.unwrap()
		)
	).rejects.toThrow('already exists');
});
