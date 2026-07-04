import type { CdStep } from '@shfs/compiler';
import { Result } from 'better-result';
import { ShellRuntimeError } from '../../diagnostics';
import {
	evaluateExpandedSinglePathEffect,
	resolvePathFromCwd,
} from '../../execute/path';
import type { FsError } from '../../fs/errors';
import type { FS } from '../../fs/fs';
import type { ActionBuiltin } from '../types';

export const cd: ActionBuiltin<CdStep['args']> = (runtime, args) => {
	return Result.gen(async function* () {
		const requestedPath = yield* await evaluateExpandedSinglePathEffect(
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
		const terminalLinkTarget = await readLinkOrNull(
			runtime.fs,
			resolvedPath
		);
		const stat = yield* await Result.tryPromise({
			try: () => runtime.fs.stat(resolvedPath),
			catch: (cause) => {
				if (isFsError(cause) && cause.code === 'ELOOP') {
					return new ShellRuntimeError({
						cause,
						exitCode: 1,
						message: `cd: Too many levels of symbolic links: ${requestedPath}`,
					});
				}

				if (terminalLinkTarget !== null) {
					return new ShellRuntimeError({
						cause,
						exitCode: 1,
						message: `cd: '${requestedPath}' is a broken symbolic link to '${terminalLinkTarget}'`,
					});
				}

				return new ShellRuntimeError({
					cause,
					exitCode: 1,
					message: `cd: directory does not exist: ${requestedPath}`,
				});
			},
		});

		if (stat.type !== 'Directory') {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `cd: not a directory: ${requestedPath}`,
			});
		}

		runtime.context.cwd = resolvedPath;
		runtime.context.status = 0;
		return Result.ok();
	});
};

async function readLinkOrNull(fs: FS, path: string): Promise<string | null> {
	return Result.tryPromise({
		try: () => fs.readLink(path),
		catch: (error) => error,
	}).then((result) =>
		result.match({
			err: () => null,
			ok: (target) => target,
		})
	);
}

function isFsError(error: unknown): error is FsError {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof (error as { code?: unknown }).code === 'string'
	);
}
