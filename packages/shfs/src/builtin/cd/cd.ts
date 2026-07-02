import type { CdStep } from '@shfs/compiler';
import { Effect } from 'effect';
import { ShellRuntimeError } from '../../diagnostics';
import {
	evaluateExpandedSinglePathEffect,
	resolvePathFromCwd,
} from '../../execute/path';
import type { ActionBuiltin } from '../types';

export const cd: ActionBuiltin<CdStep['args']> = Effect.fn('cd')(
	function* (runtime, args) {
		const requestedPath = yield* evaluateExpandedSinglePathEffect(
			'cd',
			'expected exactly 1 path after expansion',
			args.path,
			runtime.fs,
			runtime.context,
			{ allowEmpty: true }
		);
		if (requestedPath === '') {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: 'cd: empty path',
			});
		}

		const resolvedPath = resolvePathFromCwd(
			runtime.context.cwd,
			requestedPath
		);
		const stat = yield* Effect.tryPromise({
			try: () => runtime.fs.stat(resolvedPath),
			catch: (cause) =>
				new ShellRuntimeError({
					cause,
					exitCode: 1,
					message: `cd: directory does not exist: ${requestedPath}`,
				}),
		});

		if (!stat.isDirectory) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `cd: not a directory: ${requestedPath}`,
			});
		}

		runtime.context.cwd = resolvedPath;
		runtime.context.status = 0;
	}
);
