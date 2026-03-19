import type { CdStep } from '@shfs/compiler';
import {
	evaluateExpandedSinglePath,
	resolvePathFromCwd,
} from '../../execute/path';
import type { EffectBuiltin } from '../types';

export const cd: EffectBuiltin<CdStep['args']> = async (runtime, args) => {
	const requestedPath = await evaluateExpandedSinglePath(
		'cd',
		'expected exactly 1 path after expansion',
		args.path,
		runtime.fs,
		runtime.context,
		{ allowEmpty: true }
	);
	if (requestedPath === '') {
		throw new Error('cd: empty path');
	}

	const resolvedPath = resolvePathFromCwd(runtime.context.cwd, requestedPath);
	let stat: Awaited<ReturnType<typeof runtime.fs.stat>>;
	try {
		stat = await runtime.fs.stat(resolvedPath);
	} catch {
		throw new Error(`cd: directory does not exist: ${requestedPath}`);
	}

	if (!stat.isDirectory) {
		throw new Error(`cd: not a directory: ${requestedPath}`);
	}

	runtime.context.cwd = resolvedPath;
	runtime.context.status = 0;
};
