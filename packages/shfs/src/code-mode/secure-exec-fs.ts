import type {
	VirtualDirEntry,
	VirtualFileSystem,
	VirtualStat,
} from '@secure-exec/core/test-runtime';

import {
	type FS,
	type FsInfo,
	type FsType,
	InvalidOperationError,
} from '../fs';
import { normalizePath } from '../util/path';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const ROOT_DEVICE_ID = 1;
const ROOT_USER_ID = 0;
const ROOT_GROUP_ID = 0;
const BLOCK_SIZE_BYTES = 512;
const DIRECTORY_SIZE_BYTES = 4096;
const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_DIRECTORY_MODE = 0o755;
const DEFAULT_SYMLINK_MODE = 0o777;
const PERMISSION_MODE_MODULUS = 0o1_0000;

const TYPE_BITS_BY_FS_TYPE: Record<FsType, number> = {
	File: 0o10_0000,
	Directory: 0o04_0000,
	SymbolicLink: 0o12_0000,
	BlockDevice: 0o06_0000,
	CharacterDevice: 0o02_0000,
	FIFO: 0o01_0000,
	Socket: 0o14_0000,
	Unknown: 0,
};

interface EntryMetadata {
	readonly ino: number;
	atimeMs?: number;
	birthtimeMs?: number;
	ctimeMs?: number;
	gid?: number;
	mode?: number;
	mtimeMs?: number;
	uid?: number;
}

interface ErrorLike {
	code?: unknown;
	message?: unknown;
	path?: unknown;
}

export interface ShfsVirtualFileSystemOptions {
	readonly readOnly?: boolean;
}

export class ShfsVirtualFsError extends Error {
	readonly code: string;
	readonly path?: string;
	readonly syscall?: string;

	constructor(
		code: string,
		message: string,
		options: { path?: string; syscall?: string } = {}
	) {
		super(message);
		this.name = 'ShfsVirtualFsError';
		this.code = code;
		this.path = options.path;
		this.syscall = options.syscall;
	}
}

export class ShfsVirtualFileSystem implements VirtualFileSystem {
	private readonly fs: FS;
	private readonly metadata = new Map<string, EntryMetadata>();
	private readonly options: ShfsVirtualFileSystemOptions;
	private nextInode = 1;

	constructor(fs: FS, options: ShfsVirtualFileSystemOptions = {}) {
		this.fs = fs;
		this.options = options;
	}

	async readFile(path: string): Promise<Uint8Array> {
		try {
			const stat = await this.stat(path);
			if (stat.isDirectory) {
				throw new ShfsVirtualFsError('EISDIR', `open '${path}'`, {
					path,
					syscall: 'open',
				});
			}
			await this.updateAccessTime(path);
			return await this.fs.readFile(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'open', path);
		}
	}

	async readTextFile(path: string): Promise<string> {
		return textDecoder.decode(await this.readFile(path));
	}

	async readDir(path: string): Promise<string[]> {
		const entries = await this.readDirWithTypes(path);
		return entries.map((entry) => entry.name);
	}

	async readDirWithTypes(path: string): Promise<VirtualDirEntry[]> {
		try {
			const entries: VirtualDirEntry[] = [];
			for await (const childPath of this.fs.readDirectory(path)) {
				const name = basename(childPath);
				const childStat = await this.lstat(joinPath(path, name));
				entries.push({
					name,
					isDirectory: childStat.isDirectory,
					isSymbolicLink: childStat.isSymbolicLink,
				});
			}
			return entries;
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'scandir', path);
		}
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		this.assertWritable(path, 'open');
		try {
			const data =
				typeof content === 'string'
					? textEncoder.encode(content)
					: content;
			await this.fs.writeFile(path, data);
			await this.updateChangeTime(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'open', path);
		}
	}

	async createDir(path: string): Promise<void> {
		this.assertWritable(path, 'mkdir');
		try {
			if (await this.fs.exists(path)) {
				return;
			}
			await this.fs.makeDirectory(path, { recursive: false });
			this.getMetadata(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'mkdir', path);
		}
	}

	async mkdir(
		path: string,
		options?: { recursive?: boolean }
	): Promise<void> {
		this.assertWritable(path, 'mkdir');
		try {
			const recursive = options?.recursive ?? true;
			if (!recursive && (await this.fs.exists(path))) {
				return;
			}
			await this.fs.makeDirectory(path, { recursive });
			this.getMetadata(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'mkdir', path);
		}
	}

	async exists(path: string): Promise<boolean> {
		if (await this.fs.exists(path)) {
			return true;
		}
		try {
			await this.fs.readLink(path);
			return true;
		} catch {
			return false;
		}
	}

	async stat(path: string): Promise<VirtualStat> {
		try {
			const realPath = await this.fs.realPath(path);
			const info = await this.fs.stat(path);
			return this.toVirtualStat(realPath, info);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'stat', path);
		}
	}

	async removeFile(path: string): Promise<void> {
		this.assertWritable(path, 'unlink');
		try {
			const stat = await this.lstat(path);
			if (stat.isDirectory && !stat.isSymbolicLink) {
				throw new ShfsVirtualFsError('EISDIR', `unlink '${path}'`, {
					path,
					syscall: 'unlink',
				});
			}
			await this.fs.remove(path);
			this.metadata.delete(normalizePath(path));
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'unlink', path);
		}
	}

	async removeDir(path: string): Promise<void> {
		this.assertWritable(path, 'rmdir');
		try {
			const stat = await this.lstat(path);
			if (!(stat.isDirectory && !stat.isSymbolicLink)) {
				throw new ShfsVirtualFsError('ENOTDIR', `rmdir '${path}'`, {
					path,
					syscall: 'rmdir',
				});
			}
			await this.fs.remove(path);
			this.metadata.delete(normalizePath(path));
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'rmdir', path);
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		this.assertWritable(oldPath, 'rename');
		this.assertWritable(newPath, 'rename');
		try {
			await this.fs.rename(oldPath, newPath);
			const oldNormalizedPath = normalizePath(oldPath);
			const metadata = this.metadata.get(oldNormalizedPath);
			if (metadata) {
				this.metadata.delete(oldNormalizedPath);
				this.metadata.set(normalizePath(newPath), metadata);
			}
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'rename', oldPath);
		}
	}

	async realpath(path: string): Promise<string> {
		try {
			return await this.fs.realPath(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'realpath', path);
		}
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		this.assertWritable(linkPath, 'symlink');
		try {
			await this.fs.symlink(target, linkPath);
			this.getMetadata(linkPath);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'symlink', linkPath);
		}
	}

	async readlink(path: string): Promise<string> {
		try {
			return await this.fs.readLink(path);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'readlink', path);
		}
	}

	async lstat(path: string): Promise<VirtualStat> {
		try {
			try {
				const target = await this.fs.readLink(path);
				return this.toSymlinkStat(path, target);
			} catch (error) {
				if (!isInvalidOperation(error)) {
					throw error;
				}
			}
			const info = await this.fs.stat(path);
			return this.toVirtualStat(path, info);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'lstat', path);
		}
	}

	async link(oldPath: string, newPath: string): Promise<void> {
		this.assertWritable(newPath, 'link');
		try {
			if (!(await this.fs.exists(oldPath))) {
				throw new ShfsVirtualFsError('ENOENT', `link '${oldPath}'`, {
					path: oldPath,
					syscall: 'link',
				});
			}
			throw new ShfsVirtualFsError(
				'ENOSYS',
				`hard links are not supported: '${oldPath}' -> '${newPath}'`,
				{ path: oldPath, syscall: 'link' }
			);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'link', oldPath);
		}
	}

	async chmod(path: string, mode: number): Promise<void> {
		this.assertWritable(path, 'chmod');
		try {
			const realPath = await this.fs.realPath(path);
			const metadata = this.getMetadata(realPath);
			metadata.mode = permissionMode(mode);
			metadata.ctimeMs = Date.now();
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'chmod', path);
		}
	}

	async chown(path: string, uid: number, gid: number): Promise<void> {
		this.assertWritable(path, 'chown');
		try {
			const realPath = await this.fs.realPath(path);
			const metadata = this.getMetadata(realPath);
			metadata.uid = uid;
			metadata.gid = gid;
			metadata.ctimeMs = Date.now();
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'chown', path);
		}
	}

	async utimes(path: string, atime: number, mtime: number): Promise<void> {
		this.assertWritable(path, 'utimes');
		try {
			const realPath = await this.fs.realPath(path);
			const metadata = this.getMetadata(realPath);
			metadata.atimeMs = atime;
			metadata.mtimeMs = mtime;
			metadata.ctimeMs = Date.now();
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'utimes', path);
		}
	}

	async truncate(path: string, length: number): Promise<void> {
		this.assertWritable(path, 'truncate');
		try {
			assertValidOffset(length, path, 'truncate');
			const content = await this.readFile(path);
			const resized = new Uint8Array(length);
			resized.set(content.slice(0, length));
			await this.writeFile(path, resized);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'truncate', path);
		}
	}

	async pread(
		path: string,
		offset: number,
		length: number
	): Promise<Uint8Array> {
		try {
			assertValidOffset(offset, path, 'open');
			assertValidOffset(length, path, 'open');
			const content = await this.readFile(path);
			if (offset >= content.byteLength) {
				return new Uint8Array(0);
			}
			return content.slice(offset, offset + length);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'open', path);
		}
	}

	async pwrite(
		path: string,
		offset: number,
		data: Uint8Array
	): Promise<void> {
		this.assertWritable(path, 'open');
		try {
			assertValidOffset(offset, path, 'open');
			const content = await this.readFile(path);
			const nextSize = Math.max(
				content.byteLength,
				offset + data.byteLength
			);
			const updated = new Uint8Array(nextSize);
			updated.set(content);
			updated.set(data, offset);
			await this.writeFile(path, updated);
		} catch (error) {
			if (error instanceof ShfsVirtualFsError) {
				throw error;
			}
			throw toVirtualFsError(error, 'open', path);
		}
	}

	private async updateAccessTime(path: string): Promise<void> {
		const realPath = await this.safeRealPath(path);
		const metadata = this.getMetadata(realPath);
		metadata.atimeMs = Date.now();
	}

	private async updateChangeTime(path: string): Promise<void> {
		const realPath = await this.safeRealPath(path);
		const metadata = this.getMetadata(realPath);
		const now = Date.now();
		metadata.ctimeMs = now;
		metadata.mtimeMs = now;
	}

	private async safeRealPath(path: string): Promise<string> {
		try {
			return await this.fs.realPath(path);
		} catch {
			return normalizePath(path);
		}
	}

	private getMetadata(path: string): EntryMetadata {
		const normalizedPath = normalizePath(path);
		const existing = this.metadata.get(normalizedPath);
		if (existing) {
			return existing;
		}
		const metadata: EntryMetadata = { ino: this.nextInode };
		this.nextInode += 1;
		this.metadata.set(normalizedPath, metadata);
		return metadata;
	}

	private toVirtualStat(path: string, info: FsInfo): VirtualStat {
		const metadata = this.getMetadata(path);
		const defaultMode =
			info.type === 'Directory'
				? DEFAULT_DIRECTORY_MODE
				: DEFAULT_FILE_MODE;
		const mode =
			typeBitsFor(info.type) +
			permissionMode(metadata.mode ?? info.mode ?? defaultMode);
		const mtimeMs = metadata.mtimeMs ?? info.mtime.getTime();
		const atimeMs = metadata.atimeMs ?? info.atime?.getTime() ?? mtimeMs;
		const birthtimeMs =
			metadata.birthtimeMs ?? info.birthtime?.getTime() ?? mtimeMs;
		const size =
			info.type === 'Directory'
				? DIRECTORY_SIZE_BYTES
				: Math.max(0, info.size);

		return {
			mode,
			size,
			blocks: info.blocks ?? blocksForSize(size),
			dev: info.dev ?? ROOT_DEVICE_ID,
			rdev: info.rdev ?? 0,
			isDirectory: info.type === 'Directory',
			isSymbolicLink: info.type === 'SymbolicLink',
			atimeMs,
			mtimeMs,
			ctimeMs: metadata.ctimeMs ?? mtimeMs,
			birthtimeMs,
			ino: info.ino ?? metadata.ino,
			nlink: info.nlink ?? (info.type === 'Directory' ? 2 : 1),
			uid: metadata.uid ?? info.uid ?? ROOT_USER_ID,
			gid: metadata.gid ?? info.gid ?? ROOT_GROUP_ID,
		};
	}

	private toSymlinkStat(path: string, target: string): VirtualStat {
		const metadata = this.getMetadata(path);
		const now = Date.now();
		const mtimeMs = metadata.mtimeMs ?? now;
		const size = textEncoder.encode(target).byteLength;

		return {
			mode:
				TYPE_BITS_BY_FS_TYPE.SymbolicLink +
				permissionMode(metadata.mode ?? DEFAULT_SYMLINK_MODE),
			size,
			blocks: blocksForSize(size),
			dev: ROOT_DEVICE_ID,
			rdev: 0,
			isDirectory: false,
			isSymbolicLink: true,
			atimeMs: metadata.atimeMs ?? mtimeMs,
			mtimeMs,
			ctimeMs: metadata.ctimeMs ?? mtimeMs,
			birthtimeMs: metadata.birthtimeMs ?? mtimeMs,
			ino: metadata.ino,
			nlink: 1,
			uid: metadata.uid ?? ROOT_USER_ID,
			gid: metadata.gid ?? ROOT_GROUP_ID,
		};
	}

	private assertWritable(path: string, syscall: string): void {
		if (!this.options.readOnly) {
			return;
		}
		throw new ShfsVirtualFsError('EROFS', `${syscall} '${path}'`, {
			path,
			syscall,
		});
	}
}

function toVirtualFsError(
	error: unknown,
	syscall: string,
	path: string
): ShfsVirtualFsError {
	const errorLike = asErrorLike(error);
	const code = typeof errorLike?.code === 'string' ? errorLike.code : 'EIO';
	const message =
		typeof errorLike?.message === 'string'
			? errorLike.message
			: `${syscall} '${path}'`;
	const errorPath =
		typeof errorLike?.path === 'string' ? errorLike.path : path;
	return new ShfsVirtualFsError(code, message, {
		path: errorPath,
		syscall,
	});
}

function asErrorLike(error: unknown): ErrorLike | null {
	return typeof error === 'object' && error !== null
		? (error as ErrorLike)
		: null;
}

function isInvalidOperation(error: unknown): boolean {
	return (
		error instanceof InvalidOperationError ||
		asErrorLike(error)?.code === 'EINVAL'
	);
}

function typeBitsFor(type: FsType): number {
	return TYPE_BITS_BY_FS_TYPE[type];
}

function permissionMode(mode: number): number {
	return mode % PERMISSION_MODE_MODULUS;
}

function blocksForSize(size: number): number {
	if (size === 0) {
		return 0;
	}
	return Math.ceil(size / BLOCK_SIZE_BYTES);
}

function assertValidOffset(value: number, path: string, syscall: string): void {
	if (Number.isInteger(value) && value >= 0) {
		return;
	}
	throw new ShfsVirtualFsError('EINVAL', `${syscall} '${path}'`, {
		path,
		syscall,
	});
}

function basename(path: string): string {
	const normalizedPath = normalizePath(path);
	if (normalizedPath === '/') {
		return '/';
	}
	return normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
}

function joinPath(parentPath: string, childName: string): string {
	const normalizedParentPath = normalizePath(parentPath);
	return normalizePath(
		normalizedParentPath === '/'
			? `/${childName}`
			: `${normalizedParentPath}/${childName}`
	);
}
