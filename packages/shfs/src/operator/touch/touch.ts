import { Result } from 'better-result';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

export interface TouchArgs {
	files: string[];
	accessTimeOnly?: boolean;
	modificationTimeOnly?: boolean;
}

export function touch(fs: FS): ActionEffect<TouchArgs> {
	return ({ files, accessTimeOnly = false, modificationTimeOnly = false }) =>
		Result.gen(async function* () {
			const shouldUpdateMtime = !accessTimeOnly || modificationTimeOnly;

			for (const file of files) {
				const exists = yield* await Result.tryPromise({
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
					yield* await Result.tryPromise({
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
					const content = yield* await Result.tryPromise({
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
					yield* await Result.tryPromise({
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
			return Result.ok();
		});
}
