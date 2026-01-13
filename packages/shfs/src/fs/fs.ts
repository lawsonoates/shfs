import type { Stream } from '../stream';

export interface FS {
	readFile(path: string): Promise<Uint8Array>;
	readLines(path: string): Stream<string>;
	writeFile(path: string, content: Uint8Array): Promise<void>;
	deleteFile(path: string): Promise<void>;
	readdir(path: string): Stream<string>;
	mkdir(path: string, recursive?: boolean): Promise<void>;
	stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }>;
	exists(path: string): Promise<boolean>;
}
