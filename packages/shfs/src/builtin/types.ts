import type { StatementIR } from '@shfs/compiler';
import type { ShellErrorCause, ShellResult } from '../diagnostics';
import type { ShellInput, ShellIo } from '../execute/io';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { OutputStream } from '../stderr';
import type { Stream } from '../stream';

/**
 * One frame of local variables. Function calls push a barrier frame:
 * lookups stop at the barrier and fall through to globals only.
 */
export interface VariableFrame {
	vars: Map<string, string[]>;
	barrier?: boolean;
}

/**
 * A runtime-defined fish function.
 */
export interface FunctionDefinition {
	name: string;
	argumentNames: string[];
	body: StatementIR[];
}

export interface BuiltinContext {
	cwd: string;
	status: number;
	stderr: OutputStream;
	globalVars: Map<string, string[]>;
	/** Shared stdin cursor inherited by nested function statements. */
	stdin?: ShellInput;
	/** Local variable frames, innermost last. */
	scopes: VariableFrame[];
	functions: Map<string, FunctionDefinition>;
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
