import { expect, test } from 'bun:test';

import { MemoryFS } from './memory';

async function collectPaths(paths: AsyncIterable<string>): Promise<string[]> {
	const collected: string[] = [];
	for await (const path of paths) {
		collected.push(path);
	}
	return collected;
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
