import type { Stream } from '../stream';

export interface FS {
	/** Metadata for `path`, following symlinks. Detect links with readLink, not this. */
	stat(path: string): Promise<FsInfo>;
	/** Whether `path` exists. Returns false for absent paths; does not throw for absence. */
	exists(path: string): Promise<boolean>;
	/** Whole-file contents. */
	readFile(path: string): Promise<Uint8Array>;
	/** Lazily streams file contents as newline-delimited text (trailing empty line dropped). */
	readLines(path: string): Stream<string>;
	/** Writes `content`, creating missing parent directories. */
	writeFile(
		path: string,
		content: Uint8Array,
		options?: { flag?: OpenFlag; mode?: number }
	): Promise<void>;
	/** Lazily streams the immediate child paths of `path`, sorted. */
	readDirectory(
		path: string,
		options?: { recursive?: boolean }
	): Stream<string>;
	/** Creates a directory. `recursive` creates missing parents and is idempotent. */
	makeDirectory(
		path: string,
		options?: { recursive?: boolean; mode?: number }
	): Promise<void>;
	/**
	 * Removes a file or directory. Without `recursive`, a non-empty directory
	 * throws DirectoryNotEmptyError. With `force`, a missing `path` is not an error.
	 */
	remove(
		path: string,
		options?: { recursive?: boolean; force?: boolean }
	): Promise<void>;
	/**
	 * Moves an existing entry to a new path within the same filesystem.
	 * Source entries must exist, destination parents must already exist,
	 * root renames are rejected, and an existing destination file may be replaced.
	 */
	rename(oldPath: string, newPath: string): Promise<void>;
	/** Target of the symlink at `path`. Throws InvalidOperationError (EINVAL) if not a symlink. */
	readLink(path: string): Promise<string>;
	/** Canonical absolute path with every symlink resolved. Throws TooManySymbolicLinksError (ELOOP) on a cycle. */
	realPath(path: string): Promise<string>;
	/** Creates a symlink at `path` pointing to `target`. `target` is stored uninterpreted and may dangle. */
	symlink(target: string, path: string): Promise<void>;
}

export interface FsInfo {
	type: FsType;
	size: number;
	mode: number;
	mtime: Date;

	// Optional POSIX metadata: present only when a backend supplies it.
	atime?: Date;
	birthtime?: Date;
	dev?: number;
	ino?: number;
	nlink?: number;
	uid?: number;
	gid?: number;
	rdev?: number;
	blksize?: number;
	blocks?: number;
}

/**
 * The full entry-type union. Since `stat` follows links (there is no `lstat`),
 * this API does not produce 'SymbolicLink' — detect links via readLink. Device
 * and socket variants are for real backends; MemoryFS produces only
 * 'File'/'Directory'.
 */
export type FsType =
	| 'File'
	| 'Directory'
	| 'SymbolicLink'
	| 'BlockDevice'
	| 'CharacterDevice'
	| 'FIFO'
	| 'Socket'
	| 'Unknown';

export type OpenFlag =
	| 'r'
	| 'r+'
	| 'w'
	| 'wx'
	| 'w+'
	| 'wx+'
	| 'a'
	| 'ax'
	| 'a+'
	| 'ax+';
