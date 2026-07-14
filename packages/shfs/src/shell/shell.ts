import { compile, parse, type ScriptIR } from '@shfs/compiler';
import { Result } from 'better-result';

import type { FunctionDefinition } from '../builtin/types';
import { isShellFailure, reportShellFailure } from '../diagnostics';
import { execute } from '../execute/execute';
import { collectRecordStream } from '../execute/record-stream';
import type { FS } from '../fs/fs';
import {
	type OutputChannels,
	ShellError,
	ShellOutput,
} from '../output-channels';
import { formatRecords, type Record, recordsToBytes } from '../record';
import { BufferedOutputStream, formatStderr } from '../stderr';

const ROOT_DIRECTORY = '/';
const MULTIPLE_SLASH_REGEX = /\/+/g;
const TRAILING_NEWLINE_REGEX = /\n$/;
const TRAILING_SLASH_REGEX = /\/+$/;

export interface ShellOptions {
	cwd?: string;
}

export interface ShellCommand {
	readonly [Symbol.toStringTag]: string;
	arrayBuffer(): Promise<ArrayBuffer>;
	blob(): Promise<Blob>;
	bytes(): Promise<Uint8Array>;
	catch<TResult = never>(
		onrejected?:
			| null
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
	): Promise<ShellOutput | TResult>;
	cwd(path: string): ShellCommand;
	finally(onfinally?: null | (() => void)): Promise<ShellOutput>;
	json(): Promise<unknown>;
	lines(): AsyncIterable<string>;
	nothrow(): ShellCommand;
	quiet(isQuiet?: boolean): ShellCommand;
	text(): Promise<string>;
	then<TResult1 = ShellOutput, TResult2 = never>(
		onfulfilled?:
			| null
			| ((value: ShellOutput) => TResult1 | PromiseLike<TResult1>),
		onrejected?:
			| null
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
	): Promise<TResult1 | TResult2>;
	throws(shouldThrow: boolean): ShellCommand;
}

function normalizeAbsolutePath(path: string): string {
	const withLeadingSlash = path.startsWith(ROOT_DIRECTORY)
		? path
		: `${ROOT_DIRECTORY}${path}`;
	const singleSlashes = withLeadingSlash.replace(MULTIPLE_SLASH_REGEX, '/');
	const segments = singleSlashes.split(ROOT_DIRECTORY);
	const normalizedSegments: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') {
			continue;
		}
		if (segment === '..') {
			normalizedSegments.pop();
			continue;
		}
		normalizedSegments.push(segment);
	}
	return `${ROOT_DIRECTORY}${normalizedSegments.join(ROOT_DIRECTORY)}`;
}

function normalizeCwd(cwd: string): string {
	if (cwd === '') {
		return ROOT_DIRECTORY;
	}
	const normalized = normalizeAbsolutePath(cwd);
	const trimmed = normalized.replace(TRAILING_SLASH_REGEX, '');
	return trimmed === '' ? ROOT_DIRECTORY : trimmed;
}

function buildStdoutBytes(records: readonly Record[]): Uint8Array {
	return recordsToBytes(records);
}

function createShellOutput(result: OutputChannels<Record>): ShellOutput {
	return new ShellOutput({
		exitCode: result.exitCode,
		stderr: Buffer.from(formatStderr(result.stderr), 'utf8'),
		stdout: Buffer.from(buildStdoutBytes(result.stdout)),
		stdoutText: Buffer.from(formatRecords(result.stdout), 'utf8'),
	});
}

function splitLines(text: string): string[] {
	if (text === '') {
		return [];
	}
	return text.replace(TRAILING_NEWLINE_REGEX, '').split('\n');
}

class ShellPromise {
	readonly [Symbol.toStringTag] = 'ShellPromise';
	private command: ShellCommand | undefined;
	private cwdOverride: string | undefined;
	private settledResult: Promise<OutputChannels<Record>> | undefined;
	private shouldThrow = true;
	private readonly runCommand: (
		cwdOverride: string | undefined
	) => Promise<OutputChannels<Record>>;

	constructor(
		runCommand: (
			cwdOverride: string | undefined
		) => Promise<OutputChannels<Record>>
	) {
		this.runCommand = runCommand;
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		return (await this.resolveOutput()).arrayBuffer();
	}

	async blob(): Promise<Blob> {
		return (await this.resolveOutput()).blob();
	}

	async bytes(): Promise<Uint8Array> {
		return (await this.resolveOutput()).bytes();
	}

	cwd(path: string): ShellCommand {
		this.cwdOverride = normalizeCwd(path);
		return this.command ?? (this as unknown as ShellCommand);
	}

	async json(): Promise<unknown> {
		return (await this.resolveOutput()).json();
	}

	lines(): AsyncIterable<string> {
		return (async function* (command: ShellPromise): AsyncIterable<string> {
			for (const line of splitLines(await command.text())) {
				yield line;
			}
		})(this);
	}

	nothrow(): ShellCommand {
		this.shouldThrow = false;
		return this.command ?? (this as unknown as ShellCommand);
	}

	quiet(_isQuiet = true): ShellCommand {
		return this.command ?? (this as unknown as ShellCommand);
	}

	async text(): Promise<string> {
		return (await this.resolveOutput()).text();
	}

	throws(shouldThrow: boolean): ShellCommand {
		this.shouldThrow = shouldThrow;
		return this.command ?? (this as unknown as ShellCommand);
	}

	asPromise(): Promise<ShellOutput> {
		return this.resolveOutput();
	}

	setCommand(command: ShellCommand): void {
		this.command = command;
	}

	private async resolveOutput(): Promise<ShellOutput> {
		const output = createShellOutput(await this.runWithContext());
		if (this.shouldThrow && output.exitCode !== 0) {
			throw new ShellError(output);
		}
		return output;
	}

	private async runWithContext(): Promise<OutputChannels<Record>> {
		if (!this.settledResult) {
			this.settledResult = this.runCommand(this.cwdOverride);
		}
		return await this.settledResult;
	}
}

function createShellCommand(core: ShellPromise): ShellCommand {
	const command = new Proxy(core as object, {
		get(target, property, receiver) {
			if (
				property === 'then' ||
				property === 'catch' ||
				property === 'finally'
			) {
				const promise = core.asPromise() as Promise<ShellOutput>;
				const value = Reflect.get(promise, property, promise);
				return typeof value === 'function'
					? value.bind(promise)
					: value;
			}

			const value = Reflect.get(target, property, receiver);
			return typeof value === 'function' ? value.bind(core) : value;
		},
	}) as ShellCommand;

	core.setCommand(command);
	return command;
}

export class Shell {
	private readonly fs: FS;
	private currentCwd: string;
	private currentStatus = 0;
	private readonly globalVars = new Map<string, string[]>();
	private readonly functions = new Map<string, FunctionDefinition>();

	constructor(fs: FS, options: ShellOptions = {}) {
		this.fs = fs;
		this.currentCwd = normalizeCwd(options.cwd ?? ROOT_DIRECTORY);
	}

	$ = (strings: TemplateStringsArray, ...exprs: unknown[]) => {
		return this._exec(strings, ...exprs);
	};

	exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		return this._exec(strings, ...exprs);
	}

	cwd(newCwd: string): void {
		this.currentCwd = normalizeCwd(newCwd);
	}

	private _exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		const source = String.raw(strings, ...exprs);
		const fs = this.fs;
		const parseCommand = () =>
			Result.gen(function* () {
				const ast = yield* Result.try({
					try: () => parse(source),
					catch: (error) => error,
				});
				return Result.try({
					try: () => compile(ast),
					catch: (error) => error,
				});
			});

		return createShellCommand(
			new ShellPromise(async (cwdOverride) => {
				const commandStartCwd = normalizeCwd(
					cwdOverride ?? this.currentCwd
				);
				const context = {
					cwd: commandStartCwd,
					status: this.currentStatus,
					stderr: new BufferedOutputStream(),
					functions: this.functions,
					globalVars: this.globalVars,
					scopes: [{ vars: new Map<string, string[]>() }],
				};
				try {
					const runCommand = await Result.gen(async function* () {
						const script: ScriptIR = yield* parseCommand();
						const stdout: Record[] =
							yield* await collectRecordStream(
								execute(script, fs, context)
							);
						return Result.ok({
							stdout,
							stderr: context.stderr.snapshot(),
							exitCode: context.status,
						});
					});
					if (Result.isOk(runCommand)) {
						return runCommand.value;
					}
					const error = runCommand.error;
					if (!isShellFailure(error)) {
						// Unknown errors are bugs; surface them to the caller
						// like a plain throw would.
						context.status = 1;
						throw error;
					}
					reportShellFailure(context, error);
					return {
						stdout: [],
						stderr: context.stderr.snapshot(),
						exitCode: context.status ?? 1,
					};
				} finally {
					this.currentStatus = context.status ?? this.currentStatus;
					if (
						cwdOverride === undefined ||
						context.cwd !== commandStartCwd
					) {
						this.currentCwd = context.cwd;
					}
				}
			})
		);
	}
}
