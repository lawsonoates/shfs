import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';

async function collectPaths(paths: AsyncIterable<string>): Promise<string[]> {
	const collected: string[] = [];
	for await (const path of paths) {
		collected.push(path);
	}
	return collected;
}

async function readTextFile(fs: MemoryFS, path: string): Promise<string> {
	return new TextDecoder().decode(await fs.readFile(path));
}

test('symlink creates a link and readLink returns its target', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');

	await fs.symlink('/target.txt', '/link.txt');

	expect(await fs.readLink('/link.txt')).toBe('/target.txt');
});

test('readLink throws on a non-symlink', async () => {
	const fs = new MemoryFS();
	fs.setFile('/file.txt', 'x');

	await expect(fs.readLink('/file.txt')).rejects.toThrow(
		'Not a symlink: /file.txt'
	);
});

test('symlink rejects an existing path', async () => {
	const fs = new MemoryFS();
	fs.setFile('/file.txt', 'x');

	await expect(fs.symlink('/target', '/file.txt')).rejects.toThrow(
		'File already exists: /file.txt'
	);
});

test('stat follows a symlink to a file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');
	await fs.symlink('/target.txt', '/link.txt');

	const info = await fs.stat('/link.txt');

	expect(info.type).toBe('File');
	expect(info.size).toBe(5);
});

test('stat follows a symlink to a directory', async () => {
	const fs = new MemoryFS();
	await fs.makeDirectory('/dir', { recursive: true });
	await fs.symlink('/dir', '/dirlink');

	expect((await fs.stat('/dirlink')).type).toBe('Directory');
});

test('stat on a dangling symlink throws', async () => {
	const fs = new MemoryFS();
	await fs.symlink('/missing', '/link');

	await expect(fs.stat('/link')).rejects.toThrow(
		'No such file or directory: /link'
	);
});

test('a dangling symlink still exists', async () => {
	const fs = new MemoryFS();
	await fs.symlink('/missing', '/link');

	expect(await fs.exists('/link')).toBeTrue();
});

test('readFile reads through a symlink', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');
	await fs.symlink('/target.txt', '/link.txt');

	expect(await readTextFile(fs, '/link.txt')).toBe('hello');
});

test('readDirectory follows a symlink to a directory', async () => {
	const fs = new MemoryFS();
	fs.setFile('/dir/a.txt', 'a');
	fs.setFile('/dir/b.txt', 'b');
	await fs.symlink('/dir', '/dirlink');

	expect(await collectPaths(fs.readDirectory('/dirlink'))).toEqual([
		'/dir/a.txt',
		'/dir/b.txt',
	]);
});

test('symlinks appear in directory listings', async () => {
	const fs = new MemoryFS();
	fs.setFile('/dir/file.txt', 'x');
	await fs.symlink('/dir/file.txt', '/dir/link.txt');

	expect(await collectPaths(fs.readDirectory('/dir'))).toEqual([
		'/dir/file.txt',
		'/dir/link.txt',
	]);
});

test('realPath resolves a chain of symlinks', async () => {
	const fs = new MemoryFS();
	fs.setFile('/a.txt', 'a');
	await fs.symlink('/a.txt', '/b.txt');
	await fs.symlink('/b.txt', '/c.txt');

	expect(await fs.realPath('/c.txt')).toBe('/a.txt');
});

test('resolving a symlink cycle throws', async () => {
	const fs = new MemoryFS();
	await fs.symlink('/y', '/x');
	await fs.symlink('/x', '/y');

	await expect(fs.realPath('/x')).rejects.toThrow(
		'Too many levels of symbolic links'
	);
});

test('relative symlink targets resolve against the link parent', async () => {
	const fs = new MemoryFS();
	fs.setFile('/dir/target.txt', 'hi');
	await fs.symlink('target.txt', '/dir/link.txt');

	expect(await readTextFile(fs, '/dir/link.txt')).toBe('hi');
	expect(await fs.realPath('/dir/link.txt')).toBe('/dir/target.txt');
});

test('remove deletes the symlink, not its target', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');
	await fs.symlink('/target.txt', '/link.txt');

	await fs.remove('/link.txt');

	expect(await fs.exists('/link.txt')).toBeFalse();
	expect(await fs.exists('/target.txt')).toBeTrue();
});

test('rename moves a symlink and preserves its raw target', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');
	await fs.symlink('/target.txt', '/link.txt');

	await fs.rename('/link.txt', '/moved.txt');

	expect(await fs.exists('/link.txt')).toBeFalse();
	expect(await fs.readLink('/moved.txt')).toBe('/target.txt');
});

test('recursively removing a directory deletes nested symlinks', async () => {
	const fs = new MemoryFS();
	fs.setFile('/dir/target.txt', 'x');
	await fs.symlink('/dir/target.txt', '/dir/link.txt');

	await fs.remove('/dir', { recursive: true });

	expect(await fs.exists('/dir/link.txt')).toBeFalse();
	expect(await fs.exists('/dir')).toBeFalse();
});

test('renaming a directory moves nested symlinks', async () => {
	const fs = new MemoryFS();
	fs.setFile('/dir/target.txt', 'x');
	await fs.symlink('/dir/target.txt', '/dir/link.txt');

	await fs.rename('/dir', '/moved');

	expect(await fs.exists('/dir/link.txt')).toBeFalse();
	expect(await fs.readLink('/moved/link.txt')).toBe('/dir/target.txt');
});
