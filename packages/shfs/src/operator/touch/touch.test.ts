import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { touch } from './touch';

test('touch creates new empty file', async () => {
	const fs = new MemoryFS();

	const effect = touch(fs);
	await effect({ files: ['/newfile.txt'] });

	const content = await fs.readFile('/newfile.txt');
	expect(content.byteLength).toBe(0);
});

test('touch creates multiple files', async () => {
	const fs = new MemoryFS();

	const effect = touch(fs);
	await effect({ files: ['/file1.txt', '/file2.txt', '/file3.txt'] });

	for (const path of ['/file1.txt', '/file2.txt', '/file3.txt']) {
		const content = await fs.readFile(path);
		expect(content.byteLength).toBe(0);
	}
});

test('touch does not overwrite existing file', async () => {
	const fs = new MemoryFS();
	const existingContent = 'important data';
	fs.setFile('/file.txt', existingContent);

	const effect = touch(fs);
	await effect({ files: ['/file.txt'] });

	const content = await fs.readFile('/file.txt');
	expect(new TextDecoder().decode(content)).toBe(existingContent);
});

test('touch with absolute path', async () => {
	const fs = new MemoryFS();

	const effect = touch(fs);
	await effect({ files: ['/tmp/newfile.txt'] });

	const content = await fs.readFile('/tmp/newfile.txt');
	expect(content.byteLength).toBe(0);
});
