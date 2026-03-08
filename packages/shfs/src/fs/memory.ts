import type { Stream } from '../stream';
import { normalizePath } from '../util/path';
import type { FS } from './fs';

export type { FS } from './fs';

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
		const normalizedPath = normalizePath(path);
		this.ensureParentDirectories(normalizedPath);
		const encoded =
			typeof content === 'string'
				? new TextEncoder().encode(content)
				: content;
		this.files.set(normalizedPath, encoded);
		this.fileMetadata.set(normalizedPath, {
			mtime: new Date(),
			isDirectory: false,
		});
	}

	async readFile(path: string): Promise<Uint8Array> {
		const normalizedPath = normalizePath(path);
		const content = this.files.get(normalizedPath);
		if (!content) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}

	async *readLines(path: string): Stream<string> {
		const normalizedPath = normalizePath(path);
		const content = this.files.get(normalizedPath);
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
		const normalizedPath = normalizePath(path);
		this.ensureParentDirectories(normalizedPath);
		this.files.set(normalizedPath, content);
		this.fileMetadata.set(normalizedPath, {
			mtime: new Date(),
			isDirectory: false,
		});
	}

	async deleteFile(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (!this.files.has(normalizedPath)) {
			throw new Error(`File not found: ${path}`);
		}
		this.files.delete(normalizedPath);
		this.fileMetadata.delete(normalizedPath);
	}

	async deleteDirectory(path: string, recursive = false): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (normalizedPath === '/') {
			throw new Error("rm: cannot remove '/'");
		}
		if (!this.directories.has(normalizedPath)) {
			throw new Error(`No such file or directory: ${path}`);
		}

		const childPrefix = `${normalizedPath}/`;
		const hasChildDirectories = Array.from(this.directories).some(
			(directory) =>
				directory !== normalizedPath &&
				directory.startsWith(childPrefix)
		);
		const hasChildFiles = Array.from(this.files.keys()).some((filePath) =>
			filePath.startsWith(childPrefix)
		);

		if (!recursive && (hasChildDirectories || hasChildFiles)) {
			throw new Error(`Directory not empty: ${path}`);
		}

		for (const filePath of Array.from(this.files.keys())) {
			if (filePath.startsWith(childPrefix)) {
				this.files.delete(filePath);
				this.fileMetadata.delete(filePath);
			}
		}

		const directoriesToDelete = Array.from(this.directories)
			.filter(
				(directory) =>
					directory === normalizedPath ||
					directory.startsWith(childPrefix)
			)
			.sort((a, b) => b.length - a.length);
		for (const directory of directoriesToDelete) {
			if (directory === '/') {
				continue;
			}
			this.directories.delete(directory);
			this.fileMetadata.delete(directory);
		}
	}

	async *readdir(path: string): Stream<string> {
		const normalizedDirectoryPath = normalizePath(path);
		if (this.files.has(normalizedDirectoryPath)) {
			throw new Error(`Not a directory: ${path}`);
		}
		if (!this.directories.has(normalizedDirectoryPath)) {
			throw new Error(`No such file or directory: ${path}`);
		}

		const immediateChildren = this.listImmediateChildren(
			normalizedDirectoryPath
		);
		for (const childPath of immediateChildren) {
			yield childPath;
		}
	}

	async mkdir(path: string, recursive = false): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (
			this.directories.has(normalizedPath) ||
			this.files.has(normalizedPath)
		) {
			throw new Error(`Directory already exists: ${path}`);
		}

		if (recursive) {
			// Create all parent directories
			const parts = normalizedPath.split('/').filter(Boolean);
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
			const parentPath =
				normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) ||
				'/';
			if (
				parentPath !== '/' &&
				!this.directories.has(parentPath) &&
				!this.files.has(parentPath)
			) {
				throw new Error(`No such file or directory: ${parentPath}`);
			}
			this.directories.add(normalizedPath);
			this.fileMetadata.set(normalizedPath, {
				mtime: new Date(),
				isDirectory: true,
			});
		}
	}

	async stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		// Normalize path by removing trailing slash
		const normalizedPath = normalizePath(path);

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
		const normalizedPath = normalizePath(path);
		return (
			this.files.has(normalizedPath) ||
			this.directories.has(normalizedPath)
		);
	}

	private ensureParentDirectories(path: string): void {
		const parentDirectories = this.getParentDirectories(path);
		for (const directoryPath of parentDirectories) {
			if (this.directories.has(directoryPath)) {
				continue;
			}
			if (this.files.has(directoryPath)) {
				throw new Error(
					`Parent path is not a directory: ${directoryPath}`
				);
			}
			this.directories.add(directoryPath);
			this.fileMetadata.set(directoryPath, {
				mtime: new Date(),
				isDirectory: true,
			});
		}
	}

	private getParentDirectories(path: string): string[] {
		const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
		if (parentPath === '/') {
			return ['/'];
		}
		const segments = parentPath.split('/').filter(Boolean);
		const parentDirectories: string[] = ['/'];
		let currentPath = '';
		for (const segment of segments) {
			currentPath += `/${segment}`;
			parentDirectories.push(currentPath);
		}
		return parentDirectories;
	}

	private listImmediateChildren(directoryPath: string): string[] {
		const directoryPrefix =
			directoryPath === '/' ? '/' : `${directoryPath}/`;
		const children = new Set<string>();
		const allPaths = [
			...Array.from(this.directories.values()),
			...Array.from(this.files.keys()),
		];
		for (const candidatePath of allPaths) {
			if (candidatePath === directoryPath) {
				continue;
			}
			if (!candidatePath.startsWith(directoryPrefix)) {
				continue;
			}
			const relativePath = candidatePath.slice(directoryPrefix.length);
			if (relativePath === '') {
				continue;
			}
			const [firstSegment] = relativePath.split('/');
			if (!firstSegment) {
				continue;
			}
			const childPath =
				directoryPath === '/'
					? `/${firstSegment}`
					: `${directoryPath}/${firstSegment}`;
			children.add(childPath);
		}
		return Array.from(children).sort((left, right) =>
			left.localeCompare(right)
		);
	}
}
