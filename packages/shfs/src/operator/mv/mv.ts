import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

const TRAILING_SLASH_REGEX = /\/+$/;
const MULTIPLE_SLASH_REGEX = /\/+/g;

export interface MvArgs {
	srcs: string[];
	dest: string;
	force?: boolean;
	interactive?: boolean;
}

function trimTrailingSlash(path: string): string {
	return path.replace(TRAILING_SLASH_REGEX, '');
}

function extractFileName(path: string): string {
	const normalized = trimTrailingSlash(path);
	const lastSlashIndex = normalized.lastIndexOf('/');
	if (lastSlashIndex === -1) {
		return normalized;
	}
	return normalized.slice(lastSlashIndex + 1);
}

function joinPath(base: string, suffix: string): string {
	return `${trimTrailingSlash(base)}/${suffix}`.replace(
		MULTIPLE_SLASH_REGEX,
		'/'
	);
}

async function isDirectory(fs: FS, path: string): Promise<boolean> {
	try {
		const stat = await fs.stat(path);
		return stat.isDirectory;
	} catch {
		return false;
	}
}

async function assertCanMoveToDestination(
	fs: FS,
	dest: string,
	force: boolean,
	interactive: boolean
): Promise<void> {
	const exists = await fs.exists(dest);
	if (!exists) {
		return;
	}
	if (interactive) {
		throw new Error(`mv: destination exists (interactive): ${dest}`);
	}
	if (!force) {
		throw new Error(
			`mv: destination exists (use -f to overwrite): ${dest}`
		);
	}
}

export function mv(fs: FS): Effect<MvArgs> {
	return async ({ srcs, dest, force = false, interactive = false }) => {
		if (srcs.length === 0) {
			throw new Error('mv requires at least one source');
		}

		const destinationIsDirectory = await isDirectory(fs, dest);
		if (srcs.length > 1 && !destinationIsDirectory) {
			throw new Error(
				'mv destination must be a directory for multiple sources'
			);
		}

		for (const src of srcs) {
			const sourceStat = await fs.stat(src);
			if (sourceStat.isDirectory) {
				throw new Error(
					`mv: directory moves are not supported: ${src}`
				);
			}

			const targetPath =
				destinationIsDirectory || srcs.length > 1
					? joinPath(dest, extractFileName(src))
					: dest;

			await assertCanMoveToDestination(
				fs,
				targetPath,
				force,
				interactive
			);
			await fs.rename(src, targetPath);
		}
	};
}
