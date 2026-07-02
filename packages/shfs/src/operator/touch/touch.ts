import { Effect } from 'effect';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

export interface TouchArgs {
	files: string[];
	accessTimeOnly?: boolean;
	modificationTimeOnly?: boolean;
}

export function touch(fs: FS): ActionEffect<TouchArgs> {
	return Effect.fn('touch')(function* ({
		files,
		accessTimeOnly = false,
		modificationTimeOnly = false,
	}) {
		const shouldUpdateMtime = !accessTimeOnly || modificationTimeOnly;

		for (const file of files) {
			const exists = yield* Effect.tryPromise({
				try: () => fs.exists(file),
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
			if (!exists) {
				yield* Effect.tryPromise({
					try: () => fs.writeFile(file, new Uint8Array()),
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
				continue;
			}

			if (shouldUpdateMtime) {
				const content = yield* Effect.tryPromise({
					try: () => fs.readFile(file),
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
				yield* Effect.tryPromise({
					try: () => fs.writeFile(file, content),
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
		}
	});
}
