import { expect, test } from 'bun:test';

import type { FS, FsInfo } from '#shfs/fs/fs';
import { MemoryFS } from '#shfs/fs/memory';
import { mv } from '#shfs/operator/mv/mv';
import type { Stream } from '#shfs/stream';
import { normalizePath } from '#shfs/util/path';

class RecordingFS implements FS {
	readonly home = '/';
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

	async remove(
		path: string,
		_options?: { recursive?: boolean; force?: boolean }
	): Promise<void> {
		throw new Error(`remove should not be called: ${path}`);
	}

	readDirectory(path: string): Stream<string> {
		throw new Error(`readDirectory should not be called: ${path}`);
	}

	async makeDirectory(
		path: string,
		_options?: { recursive?: boolean; mode?: number }
	): Promise<void> {
		this.directories.add(normalizePath(path));
	}

	async stat(path: string): Promise<FsInfo> {
		const normalizedPath = normalizePath(path);
		if (this.directories.has(normalizedPath)) {
			return {
				type: 'Directory',
				size: 0,
				mode: 0o755,
				mtime: new Date(0),
			};
		}
		if (this.files.has(normalizedPath)) {
			return {
				type: 'File',
				size: 1,
				mode: 0o644,
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

	async readLink(path: string): Promise<string> {
		throw new Error(`readLink should not be called: ${path}`);
	}

	async realPath(path: string): Promise<string> {
		return normalizePath(path);
	}

	async symlink(target: string, path: string): Promise<void> {
		throw new Error(`symlink should not be called: ${target} -> ${path}`);
	}
}

test('mv uses rename for a single file move', async () => {
	const fs = new RecordingFS({
		files: ['/source.txt'],
	});

	const effect = mv(fs);
	(await effect({ srcs: ['/source.txt'], dest: '/dest.txt' })).unwrap();

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
	(await effect({ srcs: ['/file.txt'], dest: '/dir/' })).unwrap();

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
	(
		await effect({
			srcs: ['/file1.txt', '/file2.txt'],
			dest: '/dir/',
		})
	).unwrap();

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
		effect({ srcs: ['/source.txt'], dest: '/dest.txt' }).then((result) =>
			result.unwrap()
		)
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
	(
		await effect({
			srcs: ['/source.txt'],
			dest: '/dest.txt',
			force: true,
		})
	).unwrap();

	expect(fs.renameCalls).toEqual([{ src: '/source.txt', dest: '/dest.txt' }]);
	expect(await fs.exists('/source.txt')).toBeFalse();
	expect(await fs.exists('/dest.txt')).toBeTrue();
});

test('mv moves a symlink to a directory as a symlink', async () => {
	const fs = new MemoryFS();
	await fs.makeDirectory('/target-dir', { recursive: true });
	fs.setFile('/target-dir/file.txt', 'content');
	await fs.symlink('/target-dir', '/dirlink');

	const effect = mv(fs);
	(await effect({ srcs: ['/dirlink'], dest: '/moved-link' })).unwrap();

	expect(await fs.exists('/dirlink')).toBeFalse();
	expect(await fs.readLink('/moved-link')).toBe('/target-dir');
	expect(await fs.exists('/target-dir/file.txt')).toBeTrue();
});
