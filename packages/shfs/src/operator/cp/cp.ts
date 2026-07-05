import { Result } from 'better-result';
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

function hasTrailingSlash(path: string): boolean {
	return path !== '/' && TRAILING_SLASH_REGEX.test(path);
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
			ok: (stat) => Result.ok(stat.type === 'Directory'),
		})
	);
}

async function readLinkOrNull(fs: FS, path: string): Promise<string | null> {
	const result = await Result.tryPromise({
		try: () => fs.readLink(path),
		catch: (error) => error,
	});
	return result.match({
		err: () => null,
		ok: (target) => target,
	});
}

function assertCanWriteDestination(
	fs: FS,
	path: string,
	force: boolean,
	interactive: boolean
) {
	return Result.gen(async function* () {
		const exists = yield* await Result.tryPromise({
			try: () => fs.exists(path),
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
				message: `cp: destination exists (interactive): ${path}`,
			});
		}
		if (!force) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `cp: destination exists (use -f to overwrite): ${path}`,
			});
		}
		return Result.ok();
	});
}

function removeExistingNonDirectoryDestination(fs: FS, path: string) {
	return Result.gen(async function* () {
		const destinationIsDirectory = yield* await isDirectory(fs, path);
		if (destinationIsDirectory) {
			return Result.ok();
		}
		yield* await Result.tryPromise({
			try: () => fs.remove(path, { force: true }),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		return Result.ok();
	});
}

function copyFileWithPolicy(
	fs: FS,
	src: string,
	dest: string,
	force: boolean,
	interactive: boolean
) {
	return Result.gen(async function* () {
		yield* await assertCanWriteDestination(fs, dest, force, interactive);
		const content = yield* await Result.tryPromise({
			try: () => fs.readFile(src),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		yield* await Result.tryPromise({
			try: () => fs.writeFile(dest, content),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		return Result.ok();
	});
}

function copySymlinkWithPolicy(
	fs: FS,
	src: string,
	dest: string,
	force: boolean,
	interactive: boolean
) {
	return Result.gen(async function* () {
		yield* await assertCanWriteDestination(fs, dest, force, interactive);
		const target = yield* await Result.tryPromise({
			try: () => fs.readLink(src),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		if (force) {
			yield* await removeExistingNonDirectoryDestination(fs, dest);
		}
		yield* await Result.tryPromise({
			try: () => fs.symlink(target, dest),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
		return Result.ok();
	});
}

function copyDirectoryRecursive(
	fs: FS,
	srcDir: string,
	destDir: string,
	force: boolean,
	interactive: boolean
) {
	return Result.gen(async function* () {
		const readDirectory = (directoryPath: string) =>
			Result.gen(async function* () {
				const children: string[] = [];
				yield* await Result.tryPromise({
					try: async () => {
						for await (const childPath of fs.readDirectory(
							directoryPath
						)) {
							children.push(childPath);
						}
					},
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
				children.sort((left, right) => left.localeCompare(right));
				return Result.ok(children);
			});

		const ensureDirectory = (path: string) =>
			Result.gen(async function* () {
				const stat = await Result.tryPromise({
					try: () => fs.stat(path),
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
				if (Result.isOk(stat)) {
					if (stat.value.type === 'Directory') {
						return Result.ok();
					}
					return yield* new ShellRuntimeError({
						exitCode: 1,
						message: `cp: destination is not a directory: ${path}`,
					});
				}
				yield* await Result.tryPromise({
					try: () => fs.makeDirectory(path, { recursive: true }),
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
				return Result.ok();
			});

		const stack: Array<{ sourcePath: string; targetPath: string }> = [
			{
				sourcePath: trimTrailingSlash(srcDir),
				targetPath: trimTrailingSlash(destDir),
			},
		];

		const rootTargetPath = stack[0]?.targetPath;
		if (!rootTargetPath) {
			return Result.ok();
		}
		yield* await ensureDirectory(rootTargetPath);

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) {
				continue;
			}
			const childPaths = yield* await readDirectory(current.sourcePath);
			for (const childPath of childPaths) {
				const childName = basename(childPath);
				const targetPath = joinPath(current.targetPath, childName);
				if ((await readLinkOrNull(fs, childPath)) !== null) {
					yield* await copySymlinkWithPolicy(
						fs,
						childPath,
						targetPath,
						force,
						interactive
					);
					continue;
				}
				const sourceStat = yield* await Result.tryPromise({
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
				if (sourceStat.type === 'Directory') {
					yield* await ensureDirectory(targetPath);
					stack.push({
						sourcePath: childPath,
						targetPath,
					});
					continue;
				}
				yield* await copyFileWithPolicy(
					fs,
					childPath,
					targetPath,
					force,
					interactive
				);
			}
		}
		return Result.ok();
	});
}

interface CopySourceParams {
	dest: string;
	destinationIsDirectory: boolean;
	force: boolean;
	fs: FS;
	interactive: boolean;
	recursive: boolean;
	sourceCount: number;
	src: string;
}

function copySourceWithPolicy({
	dest,
	destinationIsDirectory,
	force,
	fs,
	interactive,
	recursive,
	sourceCount,
	src,
}: CopySourceParams) {
	return Result.gen(async function* () {
		const targetPath =
			destinationIsDirectory || sourceCount > 1
				? joinPath(dest, basename(src))
				: dest;

		if (
			recursive &&
			!hasTrailingSlash(src) &&
			(await readLinkOrNull(fs, src)) !== null
		) {
			yield* await copySymlinkWithPolicy(
				fs,
				src,
				targetPath,
				force,
				interactive
			);
			return Result.ok();
		}

		const srcStat = yield* await Result.tryPromise({
			try: () => fs.stat(src),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});

		if (srcStat.type !== 'Directory') {
			yield* await copyFileWithPolicy(
				fs,
				src,
				targetPath,
				force,
				interactive
			);
			return Result.ok();
		}

		if (!recursive) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `cp: omitting directory "${src}" (use -r)`,
			});
		}

		yield* await copyDirectoryRecursive(
			fs,
			src,
			targetPath,
			force,
			interactive
		);
		return Result.ok();
	});
}

export function cp(fs: FS): ActionEffect<CpArgs> {
	return ({ srcs, dest, force = false, interactive = false, recursive }) =>
		Result.gen(async function* () {
			if (srcs.length === 0) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: 'cp requires at least one source',
				});
			}

			const destinationIsDirectory = yield* await isDirectory(fs, dest);
			if (srcs.length > 1 && !destinationIsDirectory) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message:
						'cp destination must be a directory for multiple sources',
				});
			}

			for (const src of srcs) {
				yield* await copySourceWithPolicy({
					dest,
					destinationIsDirectory,
					force,
					fs,
					interactive,
					recursive,
					sourceCount: srcs.length,
					src,
				});
			}
			return Result.ok();
		});
}
