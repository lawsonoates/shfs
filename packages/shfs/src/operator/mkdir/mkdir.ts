import { Result } from 'better-result';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

export function mkdir(fs: FS): ActionEffect<{
	path: string;
	recursive: boolean;
}> {
	return ({ path, recursive }) =>
		Result.gen(async function* () {
			yield* await Result.tryPromise({
				try: () => fs.makeDirectory(path, { recursive }),
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
