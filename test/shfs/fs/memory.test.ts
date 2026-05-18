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
	const content = await fs.readFile(path);
	return new TextDecoder().decode(content);
}

test('readdir returns immediate absolute children for root', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/docs/sub', true);
	fs.setFile('/alpha.txt', 'a');
	fs.setFile('/docs/readme.md', 'r');

	expect(await collectPaths(fs.readdir('/'))).toEqual([
		'/alpha.txt',
		'/docs',
	]);
});

test('readdir returns immediate absolute children for nested directories', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/docs/sub', true);
	fs.setFile('/docs/readme.md', 'r');
	fs.setFile('/docs/sub/notes.md', 'n');

	expect(await collectPaths(fs.readdir('/docs'))).toEqual([
		'/docs/readme.md',
		'/docs/sub',
	]);
	expect(await collectPaths(fs.readdir('/docs/'))).toEqual([
		'/docs/readme.md',
		'/docs/sub',
	]);
});

test('readdir throws when path is a file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/alpha.txt', 'a');

	await expect(collectPaths(fs.readdir('/alpha.txt'))).rejects.toThrow(
		'Not a directory: /alpha.txt'
	);
});

test('readdir throws for non-directory paths and glob-like strings', async () => {
	const fs = new MemoryFS();
	fs.setFile('/alpha.txt', 'a');

	await expect(collectPaths(fs.readdir('/missing'))).rejects.toThrow(
		'No such file or directory: /missing'
	);
	await expect(collectPaths(fs.readdir('/**/*'))).rejects.toThrow(
		'No such file or directory: /**/*'
	);
});

test('writeFile rejects existing directory paths', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/docs', true);

	await expect(
		fs.writeFile('/docs', new TextEncoder().encode('content'))
	).rejects.toThrow('Is a directory: /docs');
});

test('rename moves a file to a new path', async () => {
	const fs = new MemoryFS();
	fs.setFile('/docs/readme.md', 'guide');

	await fs.rename('/docs/readme.md', '/docs/guide.md');

	expect(await fs.exists('/docs/readme.md')).toBeFalse();
	expect(await readTextFile(fs, '/docs/guide.md')).toBe('guide');
});

test('rename moves a directory subtree under normalized paths', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/docs/sub', true);
	fs.setFile('/docs/readme.md', 'guide');
	fs.setFile('/docs/sub/notes.md', 'notes');

	await fs.rename('/docs/', '/guides/');

	expect(await fs.exists('/docs')).toBeFalse();
	expect(await fs.exists('/docs/sub/notes.md')).toBeFalse();
	expect(await fs.exists('/guides')).toBeTrue();
	expect(await fs.exists('/guides/sub')).toBeTrue();
	expect(await readTextFile(fs, '/guides/readme.md')).toBe('guide');
	expect(await readTextFile(fs, '/guides/sub/notes.md')).toBe('notes');
	expect(await collectPaths(fs.readdir('/guides'))).toEqual([
		'/guides/readme.md',
		'/guides/sub',
	]);
});

test('rename replaces an existing destination file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'source');
	fs.setFile('/dest.txt', 'dest');

	await fs.rename('/source.txt', '/dest.txt');

	expect(await fs.exists('/source.txt')).toBeFalse();
	expect(await readTextFile(fs, '/dest.txt')).toBe('source');
});

test('rename rejects missing sources without creating a destination', async () => {
	const fs = new MemoryFS();

	await expect(fs.rename('/missing.txt', '/dest.txt')).rejects.toThrow(
		'No such file or directory: /missing.txt'
	);
	expect(await fs.exists('/dest.txt')).toBeFalse();
});

test('rename requires an existing destination parent directory', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'source');

	await expect(fs.rename('/source.txt', '/missing/dest.txt')).rejects.toThrow(
		'No such file or directory: /missing'
	);
	expect(await fs.exists('/source.txt')).toBeTrue();
});

test('rename rejects root paths', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'source');

	await expect(fs.rename('/', '/archive')).rejects.toThrow(
		'Cannot rename the root path'
	);
	await expect(fs.rename('/source.txt', '/')).rejects.toThrow(
		'Cannot rename the root path'
	);
});

test('rename rejects replacing a destination directory', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'source');
	await fs.mkdir('/docs/sub', true);
	fs.setFile('/docs/sub/notes.md', 'notes');

	await expect(fs.rename('/source.txt', '/docs')).rejects.toThrow(
		'Cannot replace directory: /docs'
	);
	expect(await readTextFile(fs, '/source.txt')).toBe('source');
	expect(await readTextFile(fs, '/docs/sub/notes.md')).toBe('notes');
});
