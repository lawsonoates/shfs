import type { Stream } from '../stream';

export interface FS {
	readFile(path: string): Promise<Uint8Array>;
	readLines(path: string): Stream<string>;
	writeFile(path: string, content: Uint8Array): Promise<void>;
	/**
	 * Moves an existing entry to a new path within the same filesystem.
	 * Source entries must exist, destination parents must already exist,
	 * root renames are rejected, and an existing destination file may be replaced.
	 */
	rename(src: string, dest: string): Promise<void>;
	deleteFile(path: string): Promise<void>;
	deleteDirectory(path: string, recursive?: boolean): Promise<void>;
	readdir(path: string): Stream<string>;
	mkdir(path: string, recursive?: boolean): Promise<void>;
	stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }>;
	exists(path: string): Promise<boolean>;
}
