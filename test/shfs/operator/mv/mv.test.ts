import { expect, test } from 'bun:test';

import type { FS } from '../../../../packages/shfs/src/fs/fs';
import { mv } from '../../../../packages/shfs/src/operator/mv/mv';
import type { Stream } from '../../../../packages/shfs/src/stream';
import { normalizePath } from '../../../../packages/shfs/src/util/path';

class RecordingFS implements FS {
	private readonly files = new Set<string>();
	private readonly directories = new Set<string>(['/']);
	readonly renameCalls: Array<{ src: string; dest: string }> = [];

	constructor(options?: { directories?: string[]; files?: string[] }) {
		for (const directory of options?.directories ?? []) {
			this.directories.add(normalizePath(directory));
		}
		for (const file of options?.files ?? []) {
			this.files.add(normalizePath(file));
		}
	}

	async readFile(path: string): Promise<Uint8Array> {
		throw new Error(`readFile should not be called: ${path}`);
	}

	readLines(path: string): Stream<string> {
		throw new Error(`readLines should not be called: ${path}`);
	}

	async writeFile(path: string, _content: Uint8Array): Promise<void> {
		throw new Error(`writeFile should not be called: ${path}`);
	}

	async rename(src: string, dest: string): Promise<void> {
		const normalizedSourcePath = normalizePath(src);
		const normalizedDestinationPath = normalizePath(dest);
		if (!this.files.has(normalizedSourcePath)) {
			throw new Error(`No such file or directory: ${src}`);
		}
		if (this.directories.has(normalizedDestinationPath)) {
			throw new Error(`Cannot replace directory: ${dest}`);
		}
		this.renameCalls.push({
			src: normalizedSourcePath,
			dest: normalizedDestinationPath,
		});
		this.files.delete(normalizedSourcePath);
		this.files.delete(normalizedDestinationPath);
		this.files.add(normalizedDestinationPath);
	}

	async deleteFile(path: string): Promise<void> {
		throw new Error(`deleteFile should not be called: ${path}`);
	}

	async deleteDirectory(path: string, _recursive?: boolean): Promise<void> {
		throw new Error(`deleteDirectory should not be called: ${path}`);
	}

	readdir(path: string): Stream<string> {
		throw new Error(`readdir should not be called: ${path}`);
	}

	async mkdir(path: string, _recursive?: boolean): Promise<void> {
		this.directories.add(normalizePath(path));
	}

	async stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		const normalizedPath = normalizePath(path);
		if (this.directories.has(normalizedPath)) {
			return {
				isDirectory: true,
				size: 0,
				mtime: new Date(0),
			};
		}
		if (this.files.has(normalizedPath)) {
			return {
				isDirectory: false,
				size: 1,
				mtime: new Date(0),
			};
		}
		throw new Error(`No such file or directory: ${path}`);
	}

	async exists(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		return (
			this.files.has(normalizedPath) ||
			this.directories.has(normalizedPath)
		);
	}
}

test('mv uses rename for a single file move', async () => {
	const fs = new RecordingFS({
		files: ['/source.txt'],
	});

	const effect = mv(fs);
	await effect({ srcs: ['/source.txt'], dest: '/dest.txt' });

	expect(fs.renameCalls).toEqual([{ src: '/source.txt', dest: '/dest.txt' }]);
	expect(await fs.exists('/source.txt')).toBeFalse();
	expect(await fs.exists('/dest.txt')).toBeTrue();
});

test('mv resolves directory destinations before renaming', async () => {
	const fs = new RecordingFS({
		directories: ['/dir'],
		files: ['/file.txt'],
	});

	const effect = mv(fs);
	await effect({ srcs: ['/file.txt'], dest: '/dir/' });

	expect(fs.renameCalls).toEqual([
		{ src: '/file.txt', dest: '/dir/file.txt' },
	]);
	expect(await fs.exists('/dir/file.txt')).toBeTrue();
});

test('mv renames each source when moving multiple files to a directory', async () => {
	const fs = new RecordingFS({
		directories: ['/dir'],
		files: ['/file1.txt', '/file2.txt'],
	});

	const effect = mv(fs);
	await effect({
		srcs: ['/file1.txt', '/file2.txt'],
		dest: '/dir/',
	});

	expect(fs.renameCalls).toEqual([
		{ src: '/file1.txt', dest: '/dir/file1.txt' },
		{ src: '/file2.txt', dest: '/dir/file2.txt' },
	]);
	expect(await fs.exists('/dir/file1.txt')).toBeTrue();
	expect(await fs.exists('/dir/file2.txt')).toBeTrue();
});

test('mv fails deterministically when destination exists without force', async () => {
	const fs = new RecordingFS({
		files: ['/source.txt', '/dest.txt'],
	});

	const effect = mv(fs);
	await expect(
		effect({ srcs: ['/source.txt'], dest: '/dest.txt' })
	).rejects.toThrow(
		'mv: destination exists (use -f to overwrite): /dest.txt'
	);
	expect(fs.renameCalls).toEqual([]);
	expect(await fs.exists('/source.txt')).toBeTrue();
	expect(await fs.exists('/dest.txt')).toBeTrue();
});

test('mv allows force overwrites through the rename primitive', async () => {
	const fs = new RecordingFS({
		files: ['/source.txt', '/dest.txt'],
	});

	const effect = mv(fs);
	await effect({
		srcs: ['/source.txt'],
		dest: '/dest.txt',
		force: true,
	});

	expect(fs.renameCalls).toEqual([{ src: '/source.txt', dest: '/dest.txt' }]);
	expect(await fs.exists('/source.txt')).toBeFalse();
	expect(await fs.exists('/dest.txt')).toBeTrue();
});
