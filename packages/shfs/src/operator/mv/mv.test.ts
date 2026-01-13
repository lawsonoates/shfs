import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { mv } from './mv';

test('mv moves single file to new location', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'content');

	const effect = mv(fs);
	await effect({ srcs: ['/source.txt'], dest: '/dest.txt' });

	// Verify source is gone
	try {
		await fs.readFile('/source.txt');
		expect.unreachable('Source file should be deleted');
	} catch (error) {
		expect((error as Error).message).toContain('not found');
	}

	// Verify destination has the content
	const content = await fs.readFile('/dest.txt');
	expect(new TextDecoder().decode(content)).toBe('content');
});

test('mv moves file to directory', async () => {
	const fs = new MemoryFS();
	fs.setFile('/file.txt', 'content');
	await fs.mkdir('/dir');

	const effect = mv(fs);
	await effect({ srcs: ['/file.txt'], dest: '/dir/' });

	// Verify file is in directory
	const content = await fs.readFile('/dir/file.txt');
	expect(new TextDecoder().decode(content)).toBe('content');
});

test('mv renames file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/old.txt', 'content');

	const effect = mv(fs);
	await effect({ srcs: ['/old.txt'], dest: '/new.txt' });

	const content = await fs.readFile('/new.txt');
	expect(new TextDecoder().decode(content)).toBe('content');
});

test('mv moves multiple files to directory', async () => {
	const fs = new MemoryFS();
	fs.setFile('/file1.txt', 'content1');
	fs.setFile('/file2.txt', 'content2');
	await fs.mkdir('/dir');

	const effect = mv(fs);
	await effect({ srcs: ['/file1.txt', '/file2.txt'], dest: '/dir/' });

	// Verify both files are in directory
	const content1 = await fs.readFile('/dir/file1.txt');
	const content2 = await fs.readFile('/dir/file2.txt');
	expect(new TextDecoder().decode(content1)).toBe('content1');
	expect(new TextDecoder().decode(content2)).toBe('content2');
});

test('mv fails if destination already exists', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'content');
	fs.setFile('/dest.txt', 'existing');

	try {
		const effect = mv(fs);
		await effect({ srcs: ['/source.txt'], dest: '/dest.txt' });
		expect.unreachable('Should have thrown error');
	} catch (error) {
		expect((error as Error).message).toContain('already exists');
	}
});
