import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { ls } from './ls';

test('ls lists files matching the glob pattern', async () => {
	const fs = new MemoryFS();

	fs.setFile('/file1.txt', 'content1');
	fs.setFile('/file2.txt', 'content2');
	fs.setFile('/dir/file3.txt', 'content3');

	const files: string[] = [];
	for await (const record of ls(fs, '/*.txt')) {
		files.push(record.path);
	}

	expect(files).toEqual(['/file1.txt', '/file2.txt']);
});
