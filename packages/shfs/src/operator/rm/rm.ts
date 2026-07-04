import { Result } from 'better-result';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

export interface RmArgs {
	path: string;
	recursive: boolean;
	force?: boolean;
	interactive?: boolean;
}

export function rm(fs: FS): ActionEffect<RmArgs> {
	return ({ path, recursive, force = false, interactive = false }) =>
		Result.gen(async function* () {
			if (interactive) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `rm: interactive mode is not supported: ${path}`,
				});
			}

			const statResult = await Result.tryPromise({
				try: () => fs.stat(path),
				catch: (cause) =>
					new ShellRuntimeError({
						cause,
						exitCode: force ? 0 : 1,
						message: force ? '' : `File not found: ${path}`,
					}),
			});
			if (Result.isError(statResult)) {
				if (force) {
					return Result.ok();
				}
				return yield* statResult;
			}

			const stat = statResult.value;
			if (stat.type !== 'Directory') {
				yield* await Result.tryPromise({
					try: () => fs.remove(path),
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
			}

			if (!recursive) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `rm: cannot remove '${path}': Is a directory`,
				});
			}
			yield* await Result.tryPromise({
				try: () => fs.remove(path, { recursive: true }),
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
}
