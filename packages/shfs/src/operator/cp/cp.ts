import { Effect } from 'effect';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

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

const assertCanWriteDestination = Effect.fnUntraced(function* (
	fs: FS,
	path: string,
	force: boolean,
	interactive: boolean
) {
	const exists = yield* Effect.tryPromise({
		try: () => fs.exists(path),
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
			message: `cp: destination exists (interactive): ${path}`,
		});
	}
	if (!force) {
		return yield* new ShellRuntimeError({
			exitCode: 1,
			message: `cp: destination exists (use -f to overwrite): ${path}`,
		});
	}
});

const copyFileWithPolicy = Effect.fnUntraced(function* (
	fs: FS,
	src: string,
	dest: string,
	force: boolean,
	interactive: boolean
) {
	yield* assertCanWriteDestination(fs, dest, force, interactive);
	const content = yield* Effect.tryPromise({
		try: () => fs.readFile(src),
		catch: (cause) =>
			new ShellRuntimeError({
				cause,
				exitCode: 1,
				message: cause instanceof Error ? cause.message : String(cause),
			}),
	});
	yield* Effect.tryPromise({
		try: () => fs.writeFile(dest, content),
		catch: (cause) =>
			new ShellRuntimeError({
				cause,
				exitCode: 1,
				message: cause instanceof Error ? cause.message : String(cause),
			}),
	});
});

const copyDirectoryRecursive = Effect.fnUntraced(function* (
	fs: FS,
	srcDir: string,
	destDir: string,
	force: boolean,
	interactive: boolean
) {
	const readDirectory = Effect.fnUntraced(function* (directoryPath: string) {
		const children: string[] = [];
		yield* Effect.tryPromise({
			try: async () => {
				for await (const childPath of fs.readdir(directoryPath)) {
					children.push(childPath);
				}
			},
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		children.sort((left, right) => left.localeCompare(right));
		return children;
	});

	const ensureDirectory = Effect.fnUntraced(function* (path: string) {
		const stat = yield* Effect.tryPromise({
			try: () => fs.stat(path),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		}).pipe(
			Effect.catchTag('ShellRuntimeError', () => Effect.succeed(null))
		);
		if (stat) {
			if (stat.isDirectory) {
				return;
			}
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `cp: destination is not a directory: ${path}`,
			});
		}
		yield* Effect.tryPromise({
			try: () => fs.mkdir(path, true),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
	});

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
	yield* ensureDirectory(rootTargetPath);

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		const childPaths = yield* readDirectory(current.sourcePath);
		for (const childPath of childPaths) {
			const childName = basename(childPath);
			const targetPath = joinPath(current.targetPath, childName);
			const sourceStat = yield* Effect.tryPromise({
				try: () => fs.stat(childPath),
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
				yield* ensureDirectory(targetPath);
				stack.push({
					sourcePath: childPath,
					targetPath,
				});
				continue;
			}
			yield* copyFileWithPolicy(
				fs,
				childPath,
				targetPath,
				force,
				interactive
			);
		}
	}
});

export function cp(fs: FS): ActionEffect<CpArgs> {
	return Effect.fn('cp')(function* ({
		srcs,
		dest,
		force = false,
		interactive = false,
		recursive,
	}) {
		if (srcs.length === 0) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: 'cp requires at least one source',
			});
		}

		const destinationIsDirectory = yield* isDirectory(fs, dest);
		if (srcs.length > 1 && !destinationIsDirectory) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message:
					'cp destination must be a directory for multiple sources',
			});
		}

		for (const src of srcs) {
			const srcStat = yield* Effect.tryPromise({
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
			const targetPath =
				destinationIsDirectory || srcs.length > 1
					? joinPath(dest, basename(src))
					: dest;

			if (srcStat.isDirectory) {
				if (!recursive) {
					return yield* new ShellRuntimeError({
						exitCode: 1,
						message: `cp: omitting directory "${src}" (use -r)`,
					});
				}
				yield* copyDirectoryRecursive(
					fs,
					src,
					targetPath,
					force,
					interactive
				);
				continue;
			}

			yield* copyFileWithPolicy(fs, src, targetPath, force, interactive);
		}
	});
}
