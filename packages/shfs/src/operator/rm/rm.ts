import { Effect } from 'effect';
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
	return Effect.fn('rm')(function* ({
		path,
		recursive,
		force = false,
		interactive = false,
	}) {
		if (interactive) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `rm: interactive mode is not supported: ${path}`,
			});
		}

		const stat = yield* Effect.tryPromise({
			try: () => fs.stat(path),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: force ? 0 : 1,
					message: force ? '' : `File not found: ${path}`,
				}),
		}).pipe(
			Effect.catchTag('ShellRuntimeError', (error) => {
				if (force) {
					return Effect.succeed(null);
				}
				return Effect.fail(error);
			})
		);
		if (!stat) {
			return;
		}

		if (!stat.isDirectory) {
			yield* Effect.tryPromise({
				try: () => fs.deleteFile(path),
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
			return;
		}

		if (!recursive) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `rm: cannot remove '${path}': Is a directory`,
			});
		}
		yield* Effect.tryPromise({
			try: () => fs.deleteDirectory(path, true),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message:
						cause instanceof Error ? cause.message : String(cause),
				}),
		});
	});
}
