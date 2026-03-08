import type { FS } from 'shfs/fs';
import { normalizePath } from 'shfs/util/path';

interface MetadataEntry {
	mtime: Date;
	isDirectory: boolean;
}

interface SerializedState {
	files: Record<string, string>;
	directories: string[];
	metadata: Record<string, { mtime: string; isDirectory: boolean }>;
}

interface FSState {
	files: Map<string, Uint8Array>;
	directories: Set<string>;
	metadata: Map<string, MetadataEntry>;
}

const DEFAULT_STORAGE_KEY = 'shfs-browser-fs-v1';

function emptyState(): FSState {
	const state: FSState = {
		files: new Map(),
		directories: new Set(['/']),
		metadata: new Map([
			[
				'/',
				{
					isDirectory: true,
					mtime: new Date(),
				},
			],
		]),
	};
	return state;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCodePoint(byte);
	}
	return btoa(binary);
}

function base64ToBytes(serialized: string): Uint8Array {
	const binary = atob(serialized);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.codePointAt(index) ?? 0;
	}
	return bytes;
}

export class BrowserStorageFS implements FS {
	private readonly storageKey: string;

	private readonly storage: Storage | null;

	private readonly state: FSState;

	constructor(storageKey = DEFAULT_STORAGE_KEY) {
		this.storageKey = storageKey;
		this.storage =
			typeof globalThis.localStorage === 'undefined'
				? null
				: globalThis.localStorage;
		this.state = this.loadState();
	}

	async readFile(path: string): Promise<Uint8Array> {
		const normalizedPath = normalizePath(path);
		const content = this.state.files.get(normalizedPath);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}

	async *readLines(path: string): AsyncIterable<string> {
		const content = await this.readFile(path);
		const text = new TextDecoder().decode(content);
		const lines = text
			.split('\n')
			.filter(
				(_, index, arr) =>
					!(index === arr.length - 1 && arr[index] === '')
			);
		yield* lines;
	}

	async writeFile(path: string, content: Uint8Array): Promise<void> {
		const normalizedPath = normalizePath(path);
		this.ensureParentDirectories(normalizedPath);
		this.state.files.set(normalizedPath, content);
		this.state.metadata.set(normalizedPath, {
			isDirectory: false,
			mtime: new Date(),
		});
		this.persist();
	}

	async deleteFile(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (!this.state.files.has(normalizedPath)) {
			throw new Error(`File not found: ${path}`);
		}
		this.state.files.delete(normalizedPath);
		this.state.metadata.delete(normalizedPath);
		this.persist();
	}

	async deleteDirectory(path: string, recursive = false): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (normalizedPath === '/') {
			throw new Error("rm: cannot remove '/'");
		}
		if (!this.state.directories.has(normalizedPath)) {
			throw new Error(`No such file or directory: ${path}`);
		}

		const childPrefix = `${normalizedPath}/`;
		const hasChildDirectories = Array.from(this.state.directories).some(
			(directory) =>
				directory !== normalizedPath &&
				directory.startsWith(childPrefix)
		);
		const hasChildFiles = Array.from(this.state.files.keys()).some(
			(filePath) => filePath.startsWith(childPrefix)
		);
		if (!recursive && (hasChildDirectories || hasChildFiles)) {
			throw new Error(`Directory not empty: ${path}`);
		}

		for (const filePath of Array.from(this.state.files.keys())) {
			if (filePath.startsWith(childPrefix)) {
				this.state.files.delete(filePath);
				this.state.metadata.delete(filePath);
			}
		}

		const directoriesToDelete = Array.from(this.state.directories)
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
			this.state.directories.delete(directory);
			this.state.metadata.delete(directory);
		}

		this.persist();
	}

	async *readdir(path: string): AsyncIterable<string> {
		const normalizedDirectoryPath = normalizePath(path);
		if (this.state.files.has(normalizedDirectoryPath)) {
			throw new Error(`Not a directory: ${path}`);
		}
		if (!this.state.directories.has(normalizedDirectoryPath)) {
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
			this.state.directories.has(normalizedPath) ||
			this.state.files.has(normalizedPath)
		) {
			throw new Error(`Directory already exists: ${path}`);
		}

		if (recursive) {
			const parts = normalizedPath.split('/').filter(Boolean);
			let current = '';
			for (const part of parts) {
				current += `/${part}`;
				if (
					!(
						this.state.directories.has(current) ||
						this.state.files.has(current)
					)
				) {
					this.state.directories.add(current);
					this.state.metadata.set(current, {
						isDirectory: true,
						mtime: new Date(),
					});
				}
			}
			this.persist();
			return;
		}

		const parentPath =
			normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/';
		if (
			parentPath !== '/' &&
			!this.state.directories.has(parentPath) &&
			!this.state.files.has(parentPath)
		) {
			throw new Error(`No such file or directory: ${parentPath}`);
		}

		this.state.directories.add(normalizedPath);
		this.state.metadata.set(normalizedPath, {
			isDirectory: true,
			mtime: new Date(),
		});
		this.persist();
	}

	async stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		const normalizedPath = normalizePath(path);
		if (this.state.directories.has(normalizedPath)) {
			return {
				isDirectory: true,
				size: 0,
				mtime:
					this.state.metadata.get(normalizedPath)?.mtime ??
					new Date(),
			};
		}

		const content = this.state.files.get(normalizedPath);
		if (content !== undefined) {
			return {
				isDirectory: false,
				size: content.byteLength,
				mtime:
					this.state.metadata.get(normalizedPath)?.mtime ??
					new Date(),
			};
		}

		throw new Error(`No such file or directory: ${path}`);
	}

	async exists(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		return (
			this.state.files.has(normalizedPath) ||
			this.state.directories.has(normalizedPath)
		);
	}

	private ensureParentDirectories(path: string): void {
		const parentDirectories = this.getParentDirectories(path);
		for (const directoryPath of parentDirectories) {
			if (this.state.directories.has(directoryPath)) {
				continue;
			}
			if (this.state.files.has(directoryPath)) {
				throw new Error(
					`Parent path is not a directory: ${directoryPath}`
				);
			}
			this.state.directories.add(directoryPath);
			this.state.metadata.set(directoryPath, {
				isDirectory: true,
				mtime: new Date(),
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
			...Array.from(this.state.directories.values()),
			...Array.from(this.state.files.keys()),
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

	private loadState(): FSState {
		if (this.storage === null) {
			return emptyState();
		}

		const serialized = this.storage.getItem(this.storageKey);
		if (serialized === null) {
			return emptyState();
		}

		try {
			const parsed = JSON.parse(serialized) as SerializedState;
			const files = new Map<string, Uint8Array>();
			for (const [path, content] of Object.entries(parsed.files)) {
				files.set(normalizePath(path), base64ToBytes(content));
			}

			const directories = new Set(
				parsed.directories.map((directory) => normalizePath(directory))
			);

			if (!directories.has('/')) {
				directories.add('/');
			}

			const metadata = new Map<string, MetadataEntry>();
			for (const [path, entry] of Object.entries(parsed.metadata)) {
				metadata.set(normalizePath(path), {
					isDirectory: entry.isDirectory,
					mtime: new Date(entry.mtime),
				});
			}

			if (!metadata.has('/')) {
				metadata.set('/', { isDirectory: true, mtime: new Date() });
			}

			for (const filePath of files.keys()) {
				const parentPath =
					filePath.slice(0, filePath.lastIndexOf('/')) || '/';
				const segments = parentPath.split('/').filter(Boolean);
				let currentPath = '';
				for (const segment of segments) {
					currentPath += `/${segment}`;
					if (!directories.has(currentPath)) {
						directories.add(currentPath);
					}
					if (!metadata.has(currentPath)) {
						metadata.set(currentPath, {
							isDirectory: true,
							mtime: new Date(),
						});
					}
				}
			}

			return {
				directories,
				files,
				metadata,
			};
		} catch {
			return emptyState();
		}
	}

	private persist(): void {
		if (this.storage === null) {
			return;
		}

		const files = Object.fromEntries(
			Array.from(this.state.files.entries()).map(([path, content]) => [
				path,
				bytesToBase64(content),
			])
		);
		const metadata = Object.fromEntries(
			Array.from(this.state.metadata.entries()).map(([path, value]) => [
				path,
				{
					isDirectory: value.isDirectory,
					mtime: value.mtime.toISOString(),
				},
			])
		);

		const serialized: SerializedState = {
			directories: Array.from(this.state.directories.values()),
			files,
			metadata,
		};
		this.storage.setItem(this.storageKey, JSON.stringify(serialized));
	}
}
