import type { Stream } from '../stream';
import type { FS } from './fs';

export class MemoryFS implements FS {
	private files = new Map<string, Uint8Array>();
	private currentDir = '/';

	setFile(path: string, content: string | Uint8Array): void {
		this.files.set(
			path,
			typeof content === 'string' ? new TextEncoder().encode(content) : content,
		);
	}

	setCwd(path: string): void {
		this.currentDir = path;
	}

	async readFile(path: string): Promise<Uint8Array> {
		const content = this.files.get(path);
		if (!content) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}

	async *readLines(path: string): Stream<string> {
		const content = this.files.get(path);
		if (!content) {
			throw new Error(`File not found: ${path}`);
		}
		const text = new TextDecoder().decode(content);
		const lines = text
			.split('\n')
			.filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''));
		yield* lines;
	}

	async writeFile(path: string, content: Uint8Array): Promise<void> {
		this.files.set(path, content);
	}

	async delete(path: string): Promise<void> {
		if (!this.files.has(path)) {
			throw new Error(`File not found: ${path}`);
		}
		this.files.delete(path);
	}

	async *list(glob: string): Stream<string> {
		const pattern = glob
			.replace(/\*\*/g, '.*')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '[^/]')
			.replace(/\./g, '\\.');

		const regex = new RegExp(`^${pattern}$`);

		const paths = Array.from(this.files.keys())
			.filter((path) => regex.test(path))
			.sort();

		for (const path of paths) {
			yield path;
		}
	}

	cwd(): string {
		return this.currentDir;
	}
}
