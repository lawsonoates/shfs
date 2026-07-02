import { Effect } from 'effect';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

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

const isDirectory = Effect.fnUntraced(function* (fs: FS, path: string) {
	return yield* Effect.tryPromise({
		try: () => fs.stat(path),
		catch: () =>
			new ShellRuntimeError({
				exitCode: 1,
				message: '',
			}),
	}).pipe(
		Effect.match({
			onFailure: () => false,
			onSuccess: (stat) => stat.isDirectory,
		})
	);
});

const assertCanMoveToDestination = Effect.fnUntraced(function* (
	fs: FS,
	dest: string,
	force: boolean,
	interactive: boolean
) {
	const exists = yield* Effect.tryPromise({
		try: () => fs.exists(dest),
		catch: (cause) =>
			new ShellRuntimeError({
				cause,
				exitCode: 1,
				message: cause instanceof Error ? cause.message : String(cause),
			}),
	});
	if (!exists) {
		return;
	}
	if (interactive) {
		return yield* new ShellRuntimeError({
			exitCode: 1,
			message: `mv: destination exists (interactive): ${dest}`,
		});
	}
	if (!force) {
		return yield* new ShellRuntimeError({
			exitCode: 1,
			message: `mv: destination exists (use -f to overwrite): ${dest}`,
		});
	}
});

export function mv(fs: FS): ActionEffect<MvArgs> {
	return Effect.fn('mv')(function* ({
		srcs,
		dest,
		force = false,
		interactive = false,
	}) {
		if (srcs.length === 0) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: 'mv requires at least one source',
			});
		}

		const destinationIsDirectory = yield* isDirectory(fs, dest);
		if (srcs.length > 1 && !destinationIsDirectory) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message:
					'mv destination must be a directory for multiple sources',
			});
		}

		for (const src of srcs) {
			const sourceStat = yield* Effect.tryPromise({
				try: () => fs.stat(src),
				catch: (cause) =>
					new ShellRuntimeError({
						cause,
						exitCode: 1,
						message:
							cause instanceof Error
								? cause.message
								: String(cause),
					}),
			});
			if (sourceStat.isDirectory) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `mv: directory moves are not supported: ${src}`,
				});
			}

			const targetPath =
				destinationIsDirectory || srcs.length > 1
					? joinPath(dest, extractFileName(src))
					: dest;

			yield* assertCanMoveToDestination(
				fs,
				targetPath,
				force,
				interactive
			);
			yield* Effect.tryPromise({
				try: () => fs.rename(src, targetPath),
				catch: (cause) =>
					new ShellRuntimeError({
						cause,
						exitCode: 1,
						message:
							cause instanceof Error
								? cause.message
								: String(cause),
					}),
			});
		}
	});
}
