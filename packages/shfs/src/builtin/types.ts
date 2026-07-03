import type { ShellErrorCause, ShellResult } from '../diagnostics';
import type { ShellInput, ShellIo } from '../execute/io';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { OutputStream } from '../stderr';
import type { Stream } from '../stream';

export interface BuiltinContext {
	cwd: string;
	status: number;
	stderr: OutputStream;
	globalVars: Map<string, string>;
	localVars: Map<string, string>;
}

export interface BuiltinRuntime {
	fs: FS;
	context: BuiltinContext;
	input: Stream<ShellRecord> | null;
	io: ShellIo;
	stdin: ShellInput;
}

export type Builtin<A = void> = (
	runtime: BuiltinRuntime,
	args: A
) => Stream<ShellRecord>;

export type ActionBuiltin<A = void> = (
	runtime: BuiltinRuntime,
	args: A
) => ShellResult<void, ShellErrorCause>;
