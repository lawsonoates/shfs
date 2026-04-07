import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';

export interface BuiltinContext {
	cwd: string;
	status: number;
	stderr: string[];
	globalVars: Map<string, string>;
	localVars: Map<string, string>;
}

export interface BuiltinRuntime {
	fs: FS;
	context: BuiltinContext;
	input: Stream<ShellRecord> | null;
}

export type Builtin<A = void> = (
	runtime: BuiltinRuntime,
	args: A
) => Stream<ShellRecord>;

export type EffectBuiltin<A = void> = (
	runtime: BuiltinRuntime,
	args: A
) => Promise<void>;
