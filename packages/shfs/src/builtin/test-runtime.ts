import { MemoryFS } from '../fs/memory';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import type { BuiltinRuntime } from './types';

const ROOT_DIRECTORY = '/';

export function createBuiltinRuntime(options?: {
	cwd?: string;
	fs?: MemoryFS;
	input?: Stream<ShellRecord> | null;
}): BuiltinRuntime {
	const fs = options?.fs ?? new MemoryFS();
	const cwd = options?.cwd ?? ROOT_DIRECTORY;

	const runtime: BuiltinRuntime = {
		context: {
			cwd,
			globalVars: new Map<string, string>(),
			localVars: new Map<string, string>(),
			status: 0,
		},
		fs,
		input: options?.input ?? null,
	};

	return runtime;
}
