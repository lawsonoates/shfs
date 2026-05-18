import type { Stream } from '../stream';
import { normalizePath } from '../util/path';
import type { FS } from './fs';

export type { FS } from './fs';

export class MemoryFS implements FS {
	private readonly files = new Map<string, Uint8Array>();
	private readonly directories = new Set<string>();
	private readonly directoryChildren = new Map<string, Set<string>>();
	private readonly sortedDirectoryChildren = new Map<string, string[]>();
	private readonly fileMetadata = new Map<
		string,
		{ mtime: Date; isDirectory: boolean }
	>();

	constructor() {
		// Initialize root directory
		this.directories.add('/');
		this.directoryChildren.set('/', new Set());
		this.fileMetadata.set('/', { mtime: new Date(), isDirectory: true });
	}

	setFile(path: string, content: string | Uint8Array): void {
		const normalizedPath = normalizePath(path);
		if (this.directories.has(normalizedPath)) {
			throw new Error(`Is a directory: ${path}`);
		}
		this.ensureParentDirectories(normalizedPath);
		const encoded =
			typeof content === 'string'
				? new TextEncoder().encode(content)
				: content;
		this.files.set(normalizedPath, encoded);
		this.trackChild(normalizedPath);
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
		if (this.directories.has(normalizedPath)) {
			throw new Error(`Is a directory: ${path}`);
		}
		this.ensureParentDirectories(normalizedPath);
		this.files.set(normalizedPath, content);
		this.trackChild(normalizedPath);
		this.fileMetadata.set(normalizedPath, {
			mtime: new Date(),
			isDirectory: false,
		});
	}

	async rename(src: string, dest: string): Promise<void> {
		const normalizedSourcePath = normalizePath(src);
		const normalizedDestinationPath = normalizePath(dest);

		if (normalizedSourcePath === '/' || normalizedDestinationPath === '/') {
			throw new Error('Cannot rename the root path');
		}

		const sourceIsDirectory = this.directories.has(normalizedSourcePath);
		const sourceIsFile = this.files.has(normalizedSourcePath);
		if (!(sourceIsDirectory || sourceIsFile)) {
			throw new Error(`No such file or directory: ${src}`);
		}

		if (normalizedSourcePath === normalizedDestinationPath) {
			return;
		}

		const destinationParentPath = this.getParentPath(
			normalizedDestinationPath
		);
		this.assertDirectoryExists(destinationParentPath);

		if (
			sourceIsDirectory &&
			normalizedDestinationPath.startsWith(`${normalizedSourcePath}/`)
		) {
			throw new Error(`Cannot rename a directory into itself: ${dest}`);
		}

		this.assertDestinationCanBeReplaced(
			normalizedDestinationPath,
			sourceIsDirectory
		);

		if (sourceIsDirectory) {
			this.renameDirectory(
				normalizedSourcePath,
				normalizedDestinationPath
			);
			return;
		}

		this.renameFile(normalizedSourcePath, normalizedDestinationPath);
	}

	async deleteFile(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (!this.files.has(normalizedPath)) {
			throw new Error(`File not found: ${path}`);
		}
		this.files.delete(normalizedPath);
		this.untrackChild(normalizedPath);
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
		const hasChildren =
			(this.directoryChildren.get(normalizedPath)?.size ?? 0) > 0;

		if (!recursive && hasChildren) {
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
			this.directoryChildren.delete(directory);
			this.fileMetadata.delete(directory);
		}
		this.rebuildDirectoryChildren();
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
					this.addDirectory(current, new Date());
				}
			}
		} else {
			// Check if parent directory exists
			const parentPath =
				normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) ||
				'/';
			this.assertDirectoryExists(parentPath);
			this.addDirectory(normalizedPath, new Date());
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

	private addDirectory(path: string, mtime: Date): void {
		this.directories.add(path);
		if (!this.directoryChildren.has(path)) {
			this.directoryChildren.set(path, new Set());
		}
		this.trackChild(path);
		this.fileMetadata.set(path, {
			mtime,
			isDirectory: true,
		});
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
			this.addDirectory(directoryPath, new Date());
		}
	}

	private renameFile(sourcePath: string, destinationPath: string): void {
		const content = this.files.get(sourcePath);
		const metadata = this.fileMetadata.get(sourcePath);
		if (!(content && metadata)) {
			throw new Error(`No such file or directory: ${sourcePath}`);
		}

		this.files.delete(sourcePath);
		this.untrackChild(sourcePath);
		this.fileMetadata.delete(sourcePath);

		if (this.files.has(destinationPath)) {
			this.files.delete(destinationPath);
			this.untrackChild(destinationPath);
			this.fileMetadata.delete(destinationPath);
		}

		this.files.set(destinationPath, content);
		this.trackChild(destinationPath);
		this.fileMetadata.set(destinationPath, metadata);
	}

	private renameDirectory(sourcePath: string, destinationPath: string): void {
		const directoryEntries = Array.from(this.directories)
			.filter(
				(directoryPath) =>
					directoryPath === sourcePath ||
					directoryPath.startsWith(`${sourcePath}/`)
			)
			.sort((left, right) => left.length - right.length)
			.map((directoryPath) => ({
				path: directoryPath,
				metadata: this.fileMetadata.get(directoryPath) ?? {
					mtime: new Date(),
					isDirectory: true,
				},
			}));
		const fileEntries = Array.from(this.files.keys())
			.filter((filePath) => filePath.startsWith(`${sourcePath}/`))
			.sort((left, right) => left.length - right.length)
			.map((filePath) => {
				const content = this.files.get(filePath);
				const metadata = this.fileMetadata.get(filePath);
				if (!(content && metadata)) {
					throw new Error(`No such file or directory: ${filePath}`);
				}
				return {
					path: filePath,
					content,
					metadata,
				};
			});

		for (const directoryEntry of directoryEntries) {
			this.directories.delete(directoryEntry.path);
			this.fileMetadata.delete(directoryEntry.path);
		}

		for (const fileEntry of fileEntries) {
			this.files.delete(fileEntry.path);
			this.fileMetadata.delete(fileEntry.path);
		}

		for (const directoryEntry of directoryEntries) {
			const nextDirectoryPath = this.replacePathPrefix(
				directoryEntry.path,
				sourcePath,
				destinationPath
			);
			this.directories.add(nextDirectoryPath);
			this.fileMetadata.set(nextDirectoryPath, directoryEntry.metadata);
		}

		for (const fileEntry of fileEntries) {
			const nextFilePath = this.replacePathPrefix(
				fileEntry.path,
				sourcePath,
				destinationPath
			);
			this.files.set(nextFilePath, fileEntry.content);
			this.fileMetadata.set(nextFilePath, fileEntry.metadata);
		}
		this.rebuildDirectoryChildren();
	}

	private assertDirectoryExists(directoryPath: string): void {
		if (this.directories.has(directoryPath)) {
			return;
		}
		if (this.files.has(directoryPath)) {
			throw new Error(`Parent path is not a directory: ${directoryPath}`);
		}
		throw new Error(`No such file or directory: ${directoryPath}`);
	}

	private assertDestinationCanBeReplaced(
		destinationPath: string,
		sourceIsDirectory: boolean
	): void {
		if (this.files.has(destinationPath)) {
			if (!sourceIsDirectory) {
				return;
			}
			throw new Error(
				`Cannot replace file with directory: ${destinationPath}`
			);
		}

		if (this.directories.has(destinationPath)) {
			throw new Error(`Cannot replace directory: ${destinationPath}`);
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

	private getParentPath(path: string): string {
		return path.slice(0, path.lastIndexOf('/')) || '/';
	}

	private listImmediateChildren(directoryPath: string): string[] {
		const cached = this.sortedDirectoryChildren.get(directoryPath);
		if (cached) {
			return cached;
		}
		const sorted = Array.from(
			this.directoryChildren.get(directoryPath) ?? []
		).sort((left, right) => left.localeCompare(right));
		this.sortedDirectoryChildren.set(directoryPath, sorted);
		return sorted;
	}

	private rebuildDirectoryChildren(): void {
		this.directoryChildren.clear();
		this.sortedDirectoryChildren.clear();
		for (const directory of this.directories) {
			this.directoryChildren.set(directory, new Set());
		}
		for (const directory of this.directories) {
			this.trackChild(directory);
		}
		for (const filePath of this.files.keys()) {
			this.trackChild(filePath);
		}
	}

	private trackChild(path: string): void {
		if (path === '/') {
			return;
		}
		const parentPath = this.getParentPath(path);
		let children = this.directoryChildren.get(parentPath);
		if (!children) {
			children = new Set<string>();
			this.directoryChildren.set(parentPath, children);
		}
		children.add(path);
		this.sortedDirectoryChildren.delete(parentPath);
	}

	private untrackChild(path: string): void {
		if (path === '/') {
			return;
		}
		const parentPath = this.getParentPath(path);
		this.directoryChildren.get(parentPath)?.delete(path);
		this.sortedDirectoryChildren.delete(parentPath);
	}

	private replacePathPrefix(
		path: string,
		sourcePrefix: string,
		destinationPrefix: string
	): string {
		if (path === sourcePrefix) {
			return destinationPrefix;
		}
		return `${destinationPrefix}${path.slice(sourcePrefix.length)}`;
	}
}
