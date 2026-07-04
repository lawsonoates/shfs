import { Result } from 'better-result';
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

function isDirectory(fs: FS, path: string) {
	return Result.tryPromise({
		try: () => fs.stat(path),
		catch: () =>
			new ShellRuntimeError({
				exitCode: 1,
				message: '',
			}),
	}).then((result) =>
		result.match({
			err: () => Result.ok(false),
			ok: (stat) => Result.ok(stat.isDirectory),
		})
	);
}

function assertCanMoveToDestination(
	fs: FS,
	dest: string,
	force: boolean,
	interactive: boolean
) {
	return Result.gen(async function* () {
		const exists = yield* await Result.tryPromise({
			try: () => fs.exists(dest),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		if (!exists) {
			return Result.ok();
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
		return Result.ok();
	});
}

export function mv(fs: FS): ActionEffect<MvArgs> {
	return ({ srcs, dest, force = false, interactive = false }) =>
		Result.gen(async function* () {
			if (srcs.length === 0) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: 'mv requires at least one source',
				});
			}

			const destinationIsDirectory = yield* await isDirectory(fs, dest);
			if (srcs.length > 1 && !destinationIsDirectory) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message:
						'mv destination must be a directory for multiple sources',
				});
			}

			for (const src of srcs) {
				const sourceStat = yield* await Result.tryPromise({
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

				yield* await assertCanMoveToDestination(
					fs,
					targetPath,
					force,
					interactive
				);
				yield* await Result.tryPromise({
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
			return Result.ok();
		});
}
