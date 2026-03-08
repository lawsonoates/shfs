import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

const TRAILING_SLASH_REGEX = /\/+$/;
const MULTIPLE_SLASH_REGEX = /\/+/g;

export interface CpArgs {
	srcs: string[];
	dest: string;
	recursive: boolean;
	force?: boolean;
	interactive?: boolean;
}

function trimTrailingSlash(path: string): string {
	if (path === '/') {
		return path;
	}
	return path.replace(TRAILING_SLASH_REGEX, '');
}

function joinPath(base: string, suffix: string): string {
	return `${trimTrailingSlash(base)}/${suffix}`.replace(
		MULTIPLE_SLASH_REGEX,
		'/'
	);
}

function basename(path: string): string {
	const normalized = trimTrailingSlash(path);
	const slashIndex = normalized.lastIndexOf('/');
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}

async function isDirectory(fs: FS, path: string): Promise<boolean> {
	try {
		const stat = await fs.stat(path);
		return stat.isDirectory;
	} catch {
		return false;
	}
}

async function assertCanWriteDestination(
	fs: FS,
	path: string,
	force: boolean,
	interactive: boolean
): Promise<void> {
	const exists = await fs.exists(path);
	if (!exists) {
		return;
	}
	if (interactive) {
		throw new Error(`cp: destination exists (interactive): ${path}`);
	}
	if (!force) {
		throw new Error(
			`cp: destination exists (use -f to overwrite): ${path}`
		);
	}
}

async function copyFileWithPolicy(
	fs: FS,
	src: string,
	dest: string,
	force: boolean,
	interactive: boolean
): Promise<void> {
	await assertCanWriteDestination(fs, dest, force, interactive);
	const content = await fs.readFile(src);
	await fs.writeFile(dest, content);
}

async function copyDirectoryRecursive(
	fs: FS,
	srcDir: string,
	destDir: string,
	force: boolean,
	interactive: boolean
): Promise<void> {
	const readDirectory = async (directoryPath: string): Promise<string[]> => {
		const children: string[] = [];
		for await (const childPath of fs.readdir(directoryPath)) {
			children.push(childPath);
		}
		children.sort((left, right) => left.localeCompare(right));
		return children;
	};

	const ensureDirectory = async (path: string): Promise<void> => {
		try {
			const stat = await fs.stat(path);
			if (stat.isDirectory) {
				return;
			}
			throw new Error(`cp: destination is not a directory: ${path}`);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === `cp: destination is not a directory: ${path}`
			) {
				throw error;
			}
			await fs.mkdir(path, true);
		}
	};

	const stack: Array<{ sourcePath: string; targetPath: string }> = [
		{
			sourcePath: trimTrailingSlash(srcDir),
			targetPath: trimTrailingSlash(destDir),
		},
	];

	const rootTargetPath = stack[0]?.targetPath;
	if (!rootTargetPath) {
		return;
	}
	await ensureDirectory(rootTargetPath);

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		const childPaths = await readDirectory(current.sourcePath);
		for (const childPath of childPaths) {
			const childName = basename(childPath);
			const targetPath = joinPath(current.targetPath, childName);
			const sourceStat = await fs.stat(childPath);
			if (sourceStat.isDirectory) {
				await ensureDirectory(targetPath);
				stack.push({
					sourcePath: childPath,
					targetPath,
				});
				continue;
			}
			await copyFileWithPolicy(
				fs,
				childPath,
				targetPath,
				force,
				interactive
			);
		}
	}
}

export function cp(fs: FS): Effect<CpArgs> {
	return async ({
		srcs,
		dest,
		force = false,
		interactive = false,
		recursive,
	}) => {
		if (srcs.length === 0) {
			throw new Error('cp requires at least one source');
		}

		const destinationIsDirectory = await isDirectory(fs, dest);
		if (srcs.length > 1 && !destinationIsDirectory) {
			throw new Error(
				'cp destination must be a directory for multiple sources'
			);
		}

		for (const src of srcs) {
			const srcStat = await fs.stat(src);
			const targetPath =
				destinationIsDirectory || srcs.length > 1
					? joinPath(dest, basename(src))
					: dest;

			if (srcStat.isDirectory) {
				if (!recursive) {
					throw new Error(`cp: omitting directory "${src}" (use -r)`);
				}
				await copyDirectoryRecursive(
					fs,
					src,
					targetPath,
					force,
					interactive
				);
				continue;
			}

			await copyFileWithPolicy(fs, src, targetPath, force, interactive);
		}
	};
}
