import type { Stream } from '../stream';
import type { FS } from './fs';

export type { FS } from './fs';

const TRAILING_SLASH_REGEX = /\/$/;

export class MemoryFS implements FS {
	private readonly files = new Map<string, Uint8Array>();
	private readonly directories = new Set<string>();
	private readonly fileMetadata = new Map<
		string,
		{ mtime: Date; isDirectory: boolean }
	>();

	constructor() {
		// Initialize root directory
		this.directories.add('/');
		this.fileMetadata.set('/', { mtime: new Date(), isDirectory: true });
	}

	setFile(path: string, content: string | Uint8Array): void {
		const encoded =
			typeof content === 'string'
				? new TextEncoder().encode(content)
				: content;
		this.files.set(path, encoded);
		this.fileMetadata.set(path, { mtime: new Date(), isDirectory: false });
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

	async deleteFile(path: string): Promise<void> {
		if (!this.files.has(path)) {
			throw new Error(`File not found: ${path}`);
		}
		this.files.delete(path);
	}

	async *readdir(glob: string): Stream<string> {
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

	async mkdir(path: string, recursive = false): Promise<void> {
		if (this.directories.has(path) || this.files.has(path)) {
			throw new Error(`Directory already exists: ${path}`);
		}

		if (recursive) {
			// Create all parent directories
			const parts = path.split('/').filter(Boolean);
			let current = '';
			for (const part of parts) {
				current += `/${part}`;
				if (
					!(this.directories.has(current) || this.files.has(current))
				) {
					this.directories.add(current);
					this.fileMetadata.set(current, {
						mtime: new Date(),
						isDirectory: true,
					});
				}
			}
		} else {
			// Check if parent directory exists
			const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
			if (
				parentPath !== '/' &&
				!this.directories.has(parentPath) &&
				!this.files.has(parentPath)
			) {
				throw new Error(`No such file or directory: ${parentPath}`);
			}
			this.directories.add(path);
			this.fileMetadata.set(path, {
				mtime: new Date(),
				isDirectory: true,
			});
		}
	}

	async stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		// Normalize path by removing trailing slash
		const normalizedPath = path.replace(TRAILING_SLASH_REGEX, '') || '/';

		if (this.directories.has(normalizedPath)) {
			return {
				isDirectory: true,
				size: 0,
				mtime:
					this.fileMetadata.get(normalizedPath)?.mtime || new Date(),
			};
		}

		if (this.files.has(normalizedPath)) {
			const content = this.files.get(normalizedPath);
			if (content === undefined) {
				throw new Error(`No such file or directory: ${path}`);
			}
			return {
				isDirectory: false,
				size: content.byteLength,
				mtime:
					this.fileMetadata.get(normalizedPath)?.mtime || new Date(),
			};
		}

		throw new Error(`No such file or directory: ${path}`);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.directories.has(path);
	}
}
