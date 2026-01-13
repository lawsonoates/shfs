import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { mkdir } from './mkdir';

test('mkdir creates single directory', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await effect({ path: '/newdir', recursive: false });

	// Verify by trying to stat it
	const stat = await fs.stat('/newdir');
	expect(stat.isDirectory).toBe(true);
});

test('mkdir with recursive flag creates nested directories', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await effect({ path: '/a/b/c', recursive: true });

	const stat = await fs.stat('/a/b/c');
	expect(stat.isDirectory).toBe(true);
});

test('mkdir without recursive flag fails if parent does not exist', async () => {
	const fs = new MemoryFS();

	try {
		const effect = mkdir(fs);
		await effect({ path: '/parent/child', recursive: false });
		expect.unreachable('Should have thrown error');
	} catch (error) {
		expect((error as Error).message).toContain('No such file or directory');
	}
});

test('mkdir fails if directory already exists', async () => {
	const fs = new MemoryFS();

	const effect = mkdir(fs);
	await effect({ path: '/dir', recursive: false });

	try {
		await effect({ path: '/dir', recursive: false });
		expect.unreachable('Should have thrown error');
	} catch (error) {
		expect((error as Error).message).toContain('already exists');
	}
});
