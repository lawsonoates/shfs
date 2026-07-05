import { expect, test } from 'bun:test';

import { ShfsVirtualFileSystem } from '#shfs/code-mode/secure-exec-fs';
import { MemoryFS } from '#shfs/fs/memory';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

test('Secure Exec adapter exposes shfs entries with dirent metadata', async () => {
	const fs = new MemoryFS();
	fs.setFile('/project/README.md', '# Test');
	await fs.makeDirectory('/project/src', { recursive: true });
	await fs.symlink('README.md', '/project/readme-link');

	const adapter = new ShfsVirtualFileSystem(fs);
	const entries = await adapter.readDirWithTypes('/project');

	expect(entries).toHaveLength(3);
	expect(entries).toContainEqual({
		isDirectory: false,
		isSymbolicLink: false,
		name: 'README.md',
	});
	expect(entries).toContainEqual({
		isDirectory: false,
		isSymbolicLink: true,
		name: 'readme-link',
	});
	expect(entries).toContainEqual({
		isDirectory: true,
		isSymbolicLink: false,
		name: 'src',
	});
});

test('Secure Exec adapter distinguishes stat and lstat for symlinks', async () => {
	const fs = new MemoryFS();
	fs.setFile('/target.txt', 'hello');
	await fs.symlink('/target.txt', '/link.txt');

	const adapter = new ShfsVirtualFileSystem(fs);
	const stat = await adapter.stat('/link.txt');
	const linkStat = await adapter.lstat('/link.txt');

	expect(stat.isSymbolicLink).toBe(false);
	expect(stat.size).toBe(5);
	expect(linkStat.isSymbolicLink).toBe(true);
	expect(linkStat.size).toBe('/target.txt'.length);
	expect(await adapter.readlink('/link.txt')).toBe('/target.txt');
});

test('Secure Exec adapter supports random-access reads and writes', async () => {
	const fs = new MemoryFS();
	fs.setFile('/data.txt', 'hello');

	const adapter = new ShfsVirtualFileSystem(fs);
	await adapter.pwrite('/data.txt', 6, textEncoder.encode('world'));
	expect(textDecoder.decode(await adapter.readFile('/data.txt'))).toBe(
		'hello\u0000world'
	);

	expect(textDecoder.decode(await adapter.pread('/data.txt', 6, 5))).toBe(
		'world'
	);

	await adapter.truncate('/data.txt', 5);
	expect(textDecoder.decode(await adapter.readFile('/data.txt'))).toBe(
		'hello'
	);
});

test('Secure Exec adapter overlays POSIX metadata mutations', async () => {
	const fs = new MemoryFS();
	fs.setFile('/script.ts', 'export default 1;');

	const adapter = new ShfsVirtualFileSystem(fs);
	await adapter.chmod('/script.ts', 0o600);
	await adapter.chown('/script.ts', 501, 20);
	await adapter.utimes('/script.ts', 1000, 2000);

	const stat = await adapter.stat('/script.ts');
	expect(stat.mode % 0o1000).toBe(0o600);
	expect(stat.uid).toBe(501);
	expect(stat.gid).toBe(20);
	expect(stat.atimeMs).toBe(1000);
	expect(stat.mtimeMs).toBe(2000);
});

test('Secure Exec adapter rejects mutations when mounted read-only', async () => {
	const adapter = new ShfsVirtualFileSystem(new MemoryFS(), {
		readOnly: true,
	});

	await expect(
		adapter.writeFile('/blocked.txt', 'nope')
	).rejects.toMatchObject({
		code: 'EROFS',
	});
});
