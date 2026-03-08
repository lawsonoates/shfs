import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';
import { ls } from './ls';

test('ls lists immediate children for a directory path', async () => {
	const fs = new MemoryFS();

	fs.setFile('/file1.txt', 'content1');
	fs.setFile('/file2.txt', 'content2');
	fs.setFile('/dir/file3.txt', 'content3');

	const files: string[] = [];
	for await (const record of ls(fs, '/')) {
		files.push(record.path);
	}

	expect(files).toEqual(['/dir', '/file1.txt', '/file2.txt']);
});

test('ls . lists the current directory contents', async () => {
	const fs = new MemoryFS();
	const shell = new Shell(fs);

	await shell.$`mkdir -p /workspace`.text();
	await shell.$`touch /workspace/a.txt /workspace/b.txt`.text();

	expect(await shell.$`ls .`.cwd('/workspace').text()).toBe(
		'/workspace/a.txt\n/workspace/b.txt'
	);
});

test('ls <directory> lists the contents of that directory', async () => {
	const fs = new MemoryFS();
	const shell = new Shell(fs);

	await shell.$`mkdir -p /workspace/docs`.text();
	await shell.$`touch /workspace/docs/one.md /workspace/docs/two.md`.text();

	expect(await shell.$`ls /workspace/docs`.text()).toBe(
		'/workspace/docs/one.md\n/workspace/docs/two.md'
	);
});

test('shell expands globs before invoking ls', async () => {
	const fs = new MemoryFS();
	const shell = new Shell(fs);

	await shell.$`mkdir -p /workspace`.text();
	await shell.$`touch /workspace/a.txt /workspace/b.txt /workspace/c.md`.text();

	expect(await shell.$`ls /workspace/*.txt`.text()).toBe(
		'/workspace/a.txt\n/workspace/b.txt'
	);
});
