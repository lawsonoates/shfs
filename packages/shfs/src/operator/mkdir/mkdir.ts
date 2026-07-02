import { Effect } from 'effect';
import { ShellRuntimeError } from '../../diagnostics';
import type { FS } from '../../fs/fs';
import type { ActionEffect } from '../types';

export function mkdir(fs: FS): ActionEffect<{
	path: string;
	recursive: boolean;
}> {
	return Effect.fn('mkdir')(function* ({ path, recursive }) {
		yield* Effect.tryPromise({
			try: () => fs.mkdir(path, recursive),
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
