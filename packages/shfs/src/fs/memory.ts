import type { Stream } from '../stream';
import { normalizePath } from '../util/path';
import {
	AlreadyExistsError,
	DirectoryNotEmptyError,
	InvalidOperationError,
	IsADirectoryError,
	NotADirectoryError,
	NotFoundError,
	TooManySymbolicLinksError,
} from './errors';
import type { FS, FsInfo } from './fs';

export type { FS } from './fs';

const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;
const MAX_SYMLINK_HOPS = 40;

export class MemoryFS implements FS {
	private readonly files = new Map<string, Uint8Array>();
	private readonly directories = new Set<string>();
	private readonly symlinks = new Map<string, string>();
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
			throw new IsADirectoryError(path, `Is a directory: ${path}`);
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
		const normalizedPath = this.resolveSymlink(path);
		const content = this.files.get(normalizedPath);
		if (!content) {
			throw new NotFoundError(path, `File not found: ${path}`);
		}
		return content;
	}

	async *readLines(path: string): Stream<string> {
		const normalizedPath = this.resolveSymlink(path);
		const content = this.files.get(normalizedPath);
		if (!content) {
			throw new NotFoundError(path, `File not found: ${path}`);
		}
		const text = new TextDecoder().decode(content);
		const lines = text
			.split('\n')
			.filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''));
		yield* lines;
	}

	async writeFile(
		path: string,
		content: Uint8Array,
		// `flag`/`mode` are accepted for interface parity but not yet honored.
		_options?: { flag?: string; mode?: number }
	): Promise<void> {
		const normalizedPath = this.resolveSymlink(path);
		if (this.directories.has(normalizedPath)) {
			throw new IsADirectoryError(path, `Is a directory: ${path}`);
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
			throw new InvalidOperationError('/', 'Cannot rename the root path');
		}

		const sourceIsDirectory = this.directories.has(normalizedSourcePath);
		const sourceIsFile = this.files.has(normalizedSourcePath);
		const sourceIsSymlink = this.symlinks.has(normalizedSourcePath);
		if (!(sourceIsDirectory || sourceIsFile || sourceIsSymlink)) {
			throw new NotFoundError(src, `No such file or directory: ${src}`);
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
			throw new InvalidOperationError(
				dest,
				`Cannot rename a directory into itself: ${dest}`
			);
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

		if (sourceIsSymlink) {
			this.renameSymlink(normalizedSourcePath, normalizedDestinationPath);
			return;
		}

		this.renameFile(normalizedSourcePath, normalizedDestinationPath);
	}

	async remove(
		path: string,
		options?: { recursive?: boolean; force?: boolean }
	): Promise<void> {
		const recursive = options?.recursive ?? false;
		const force = options?.force ?? false;
		const normalizedPath = normalizePath(path);

		const isSymlink = this.symlinks.has(normalizedPath);
		const isFile = this.files.has(normalizedPath);
		const isDirectory = this.directories.has(normalizedPath);
		if (!(isSymlink || isFile || isDirectory)) {
			if (force) {
				return;
			}
			throw new NotFoundError(path, `No such file or directory: ${path}`);
		}

		// A terminal symlink is removed as itself, never followed.
		if (isSymlink) {
			this.symlinks.delete(normalizedPath);
			this.untrackChild(normalizedPath);
			this.fileMetadata.delete(normalizedPath);
			return;
		}

		if (isFile) {
			this.files.delete(normalizedPath);
			this.untrackChild(normalizedPath);
			this.fileMetadata.delete(normalizedPath);
			return;
		}

		if (normalizedPath === '/') {
			throw new InvalidOperationError('/', "rm: cannot remove '/'");
		}

		const childPrefix = `${normalizedPath}/`;
		const hasChildren =
			(this.directoryChildren.get(normalizedPath)?.size ?? 0) > 0;

		if (!recursive && hasChildren) {
			throw new DirectoryNotEmptyError(
				path,
				`Directory not empty: ${path}`
			);
		}

		for (const filePath of Array.from(this.files.keys())) {
			if (filePath.startsWith(childPrefix)) {
				this.files.delete(filePath);
				this.fileMetadata.delete(filePath);
			}
		}

		for (const linkPath of Array.from(this.symlinks.keys())) {
			if (linkPath.startsWith(childPrefix)) {
				this.symlinks.delete(linkPath);
				this.fileMetadata.delete(linkPath);
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

	async *readDirectory(
		path: string,
		options?: { recursive?: boolean }
	): Stream<string> {
		const normalizedDirectoryPath = this.resolveSymlink(path);
		if (this.files.has(normalizedDirectoryPath)) {
			throw new NotADirectoryError(path, `Not a directory: ${path}`);
		}
		if (!this.directories.has(normalizedDirectoryPath)) {
			throw new NotFoundError(path, `No such file or directory: ${path}`);
		}

		yield* this.listChildren(
			normalizedDirectoryPath,
			options?.recursive ?? false
		);
	}

	async makeDirectory(
		path: string,
		options?: { recursive?: boolean; mode?: number }
	): Promise<void> {
		const recursive = options?.recursive ?? false;
		const normalizedPath = normalizePath(path);
		if (
			this.directories.has(normalizedPath) ||
			this.files.has(normalizedPath) ||
			this.symlinks.has(normalizedPath)
		) {
			throw new AlreadyExistsError(
				path,
				`Directory already exists: ${path}`
			);
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

	async stat(path: string): Promise<FsInfo> {
		// `stat` follows symlinks, so resolve any terminal link chain first.
		const normalizedPath = this.resolveSymlink(path);

		if (this.directories.has(normalizedPath)) {
			return {
				type: 'Directory',
				size: 0,
				mode: DIRECTORY_MODE,
				mtime:
					this.fileMetadata.get(normalizedPath)?.mtime ?? new Date(),
			};
		}

		if (this.files.has(normalizedPath)) {
			const content = this.files.get(normalizedPath);
			if (content === undefined) {
				throw new NotFoundError(
					path,
					`No such file or directory: ${path}`
				);
			}
			return {
				type: 'File',
				size: content.byteLength,
				mode: FILE_MODE,
				mtime:
					this.fileMetadata.get(normalizedPath)?.mtime ?? new Date(),
			};
		}

		throw new NotFoundError(path, `No such file or directory: ${path}`);
	}

	async exists(path: string): Promise<boolean> {
		// Existence of the entry itself (a dangling symlink still exists).
		const normalizedPath = normalizePath(path);
		if (
			this.files.has(normalizedPath) ||
			this.directories.has(normalizedPath) ||
			this.symlinks.has(normalizedPath)
		) {
			return true;
		}
		const resolvedPath = this.resolveSymlink(path);
		return (
			this.files.has(resolvedPath) || this.directories.has(resolvedPath)
		);
	}

	async readLink(path: string): Promise<string> {
		const symlinkPath = this.resolveParentSymlinks(path);
		const target = this.symlinks.get(symlinkPath);
		if (target === undefined) {
			throw new InvalidOperationError(path, `Not a symlink: ${path}`);
		}
		return target;
	}

	async realPath(path: string): Promise<string> {
		return this.resolveSymlink(path);
	}

	async symlink(target: string, path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		if (
			this.files.has(normalizedPath) ||
			this.directories.has(normalizedPath) ||
			this.symlinks.has(normalizedPath)
		) {
			throw new AlreadyExistsError(path, `File already exists: ${path}`);
		}
		const parentPath = this.getParentPath(normalizedPath);
		this.assertDirectoryExists(parentPath);
		this.symlinks.set(normalizedPath, target);
		this.trackChild(normalizedPath);
		this.fileMetadata.set(normalizedPath, {
			mtime: new Date(),
			isDirectory: false,
		});
	}

	private resolveSymlink(path: string): string {
		let current = normalizePath(path);
		let hops = 0;
		while (true) {
			const symlink = this.findFirstSymlinkInPath(current);
			if (!symlink) {
				return current;
			}
			hops += 1;
			if (hops > MAX_SYMLINK_HOPS) {
				throw new TooManySymbolicLinksError(
					path,
					`Too many levels of symbolic links: ${path}`
				);
			}
			const targetPath = symlink.target.startsWith('/')
				? normalizePath(symlink.target)
				: normalizePath(
						`${this.getParentPath(symlink.path)}/${symlink.target}`
					);
			current =
				symlink.remainingPath === ''
					? targetPath
					: normalizePath(`${targetPath}/${symlink.remainingPath}`);
		}
	}

	private findFirstSymlinkInPath(
		path: string
	): { path: string; remainingPath: string; target: string } | null {
		const normalizedPath = normalizePath(path);
		if (normalizedPath === '/') {
			return null;
		}

		const segments = normalizedPath.split('/').filter(Boolean);
		let currentPath = '';
		for (const [index, segment] of segments.entries()) {
			currentPath += `/${segment}`;
			const target = this.symlinks.get(currentPath);
			if (target === undefined) {
				continue;
			}
			return {
				path: currentPath,
				remainingPath: segments.slice(index + 1).join('/'),
				target,
			};
		}
		return null;
	}

	private resolveParentSymlinks(path: string): string {
		const normalizedPath = normalizePath(path);
		const parentPath = this.getParentPath(normalizedPath);
		const entryName = normalizedPath.slice(
			parentPath === '/' ? 1 : parentPath.length + 1
		);
		const resolvedParentPath = this.resolveSymlink(parentPath);
		if (entryName === '') {
			return resolvedParentPath;
		}
		return normalizePath(`${resolvedParentPath}/${entryName}`);
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
				throw new NotADirectoryError(
					directoryPath,
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
			throw new NotFoundError(
				sourcePath,
				`No such file or directory: ${sourcePath}`
			);
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

	private renameSymlink(sourcePath: string, destinationPath: string): void {
		const target = this.symlinks.get(sourcePath);
		if (target === undefined) {
			throw new NotFoundError(
				sourcePath,
				`No such file or directory: ${sourcePath}`
			);
		}
		const metadata = this.fileMetadata.get(sourcePath) ?? {
			mtime: new Date(),
			isDirectory: false,
		};

		this.symlinks.delete(sourcePath);
		this.untrackChild(sourcePath);
		this.fileMetadata.delete(sourcePath);

		if (this.files.has(destinationPath)) {
			this.files.delete(destinationPath);
			this.untrackChild(destinationPath);
			this.fileMetadata.delete(destinationPath);
		}

		this.symlinks.set(destinationPath, target);
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
					throw new NotFoundError(
						filePath,
						`No such file or directory: ${filePath}`
					);
				}
				return {
					path: filePath,
					content,
					metadata,
				};
			});
		const symlinkEntries = Array.from(this.symlinks.keys())
			.filter((linkPath) => linkPath.startsWith(`${sourcePath}/`))
			.map((linkPath) => ({
				path: linkPath,
				target: this.symlinks.get(linkPath) as string,
				metadata: this.fileMetadata.get(linkPath) ?? {
					mtime: new Date(),
					isDirectory: false,
				},
			}));

		for (const directoryEntry of directoryEntries) {
			this.directories.delete(directoryEntry.path);
			this.fileMetadata.delete(directoryEntry.path);
		}

		for (const fileEntry of fileEntries) {
			this.files.delete(fileEntry.path);
			this.fileMetadata.delete(fileEntry.path);
		}

		for (const symlinkEntry of symlinkEntries) {
			this.symlinks.delete(symlinkEntry.path);
			this.fileMetadata.delete(symlinkEntry.path);
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

		for (const symlinkEntry of symlinkEntries) {
			const nextLinkPath = this.replacePathPrefix(
				symlinkEntry.path,
				sourcePath,
				destinationPath
			);
			this.symlinks.set(nextLinkPath, symlinkEntry.target);
			this.fileMetadata.set(nextLinkPath, symlinkEntry.metadata);
		}
		this.rebuildDirectoryChildren();
	}

	private assertDirectoryExists(directoryPath: string): void {
		if (this.directories.has(directoryPath)) {
			return;
		}
		if (this.files.has(directoryPath)) {
			throw new NotADirectoryError(
				directoryPath,
				`Parent path is not a directory: ${directoryPath}`
			);
		}
		throw new NotFoundError(
			directoryPath,
			`No such file or directory: ${directoryPath}`
		);
	}

	private assertDestinationCanBeReplaced(
		destinationPath: string,
		sourceIsDirectory: boolean
	): void {
		if (this.files.has(destinationPath)) {
			if (!sourceIsDirectory) {
				return;
			}
			throw new InvalidOperationError(
				destinationPath,
				`Cannot replace file with directory: ${destinationPath}`
			);
		}

		if (this.directories.has(destinationPath)) {
			throw new InvalidOperationError(
				destinationPath,
				`Cannot replace directory: ${destinationPath}`
			);
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

	private *listChildren(
		directoryPath: string,
		recursive: boolean
	): Iterable<string> {
		for (const childPath of this.listImmediateChildren(directoryPath)) {
			yield childPath;
			if (recursive && this.directories.has(childPath)) {
				yield* this.listChildren(childPath, true);
			}
		}
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
		for (const linkPath of this.symlinks.keys()) {
			this.trackChild(linkPath);
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
