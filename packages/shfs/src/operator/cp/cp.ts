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
			ok: (stat) => Result.ok(stat.isDirectory),
		})
	);
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
						for await (const childPath of fs.readdir(
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
					if (stat.value.isDirectory) {
						return Result.ok();
					}
					return yield* new ShellRuntimeError({
						exitCode: 1,
						message: `cp: destination is not a directory: ${path}`,
					});
				}
				yield* await Result.tryPromise({
					try: () => fs.mkdir(path, true),
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
				if (sourceStat.isDirectory) {
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
				const srcStat = yield* await Result.tryPromise({
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
					yield* await copyDirectoryRecursive(
						fs,
						src,
						targetPath,
						force,
						interactive
					);
					continue;
				}

				yield* await copyFileWithPolicy(
					fs,
					src,
					targetPath,
					force,
					interactive
				);
			}
			return Result.ok();
		});
}
