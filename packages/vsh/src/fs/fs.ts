import type { Stream } from '../stream';

export interface FS {
	readFile(path: string): Promise<Uint8Array>;
	readLines(path: string): Stream<string>;
	writeFile(path: string, content: Uint8Array): Promise<void>;
	delete(path: string): Promise<void>;
	list(glob: string): Stream<string>;
	cwd(): string;
}
