import {
	compileEffect,
	isCompileError,
	isParseSyntaxError,
	parseEffect,
	type ScriptIR,
} from '@shfs/compiler';
import { Effect } from 'effect';

import { collect } from '../consumer/consumer';
import {
	isShellDiagnosticError,
	isShellRuntimeError,
	writeDiagnosticsToStderr,
} from '../diagnostics';
import { type ExecuteResult, execute } from '../execute/execute';
import type { FS } from '../fs/fs';
import {
	type OutputChannels,
	ShellError,
	ShellOutput,
} from '../output-channels';
import { formatRecord, type Record } from '../record';
import {
	BufferedOutputStream,
	formatStderr,
	type OutputStream,
} from '../stderr';
import { lazy } from '../util/lazy';

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

async function collectStdoutRecords(result: ExecuteResult): Promise<Record[]> {
	if (result.kind === 'sink') {
		await result.value;
		return [];
	}
	return collect<Record>()(result.value);
}

function buildStdoutText(records: readonly Record[]): string {
	return records.map((record) => formatRecord(record)).join('\n');
}

function createShellOutput(result: OutputChannels<Record>): ShellOutput {
	return new ShellOutput({
		exitCode: result.exitCode,
		stderr: Buffer.from(formatStderr(result.stderr), 'utf8'),
		stdout: Buffer.from(buildStdoutText(result.stdout), 'utf8'),
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
	private readonly globalVars = new Map<string, string>();

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
		const ir = lazy<Effect.Effect<ScriptIR, unknown>>(() =>
			Effect.gen(function* () {
				const ast = yield* parseEffect(source);
				return yield* compileEffect(ast);
			})
		);

		return createShellCommand(
			new ShellPromise(async (cwdOverride) => {
				const commandStartCwd = normalizeCwd(
					cwdOverride ?? this.currentCwd
				);
				const context = {
					cwd: commandStartCwd,
					status: this.currentStatus,
					stderr: new BufferedOutputStream(),
					globalVars: this.globalVars,
					localVars: new Map<string, string>(),
				};
				const runCommand = Effect.gen(function* () {
					const script: ScriptIR = yield* ir();
					const stdout: Record[] = yield* Effect.promise(() =>
						collectStdoutRecords(execute(script, fs, context))
					);
					return {
						stdout,
						stderr: context.stderr.snapshot(),
						exitCode: context.status,
					};
				}).pipe(
					Effect.catchIf(
						(error: unknown): error is unknown => true,
						(error: unknown) =>
							Effect.sync(() => {
								handleDiagnosticFailure(error, context);
								return {
									stdout: [],
									stderr: context.stderr.snapshot(),
									exitCode: context.status ?? 1,
								};
							})
					),
					Effect.ensuring(
						Effect.sync(() => {
							this.currentStatus =
								context.status ?? this.currentStatus;
							if (
								cwdOverride === undefined ||
								context.cwd !== commandStartCwd
							) {
								this.currentCwd = context.cwd;
							}
						})
					)
				);
				return await Effect.runPromise(runCommand);
			})
		);
	}
}

function handleDiagnosticFailure(
	error: unknown,
	context: {
		status?: number;
		stderr: OutputStream;
	}
): void {
	if (isParseSyntaxError(error)) {
		context.status = 1;
		writeDiagnosticsToStderr(context, [error.diagnostic]);
		return;
	}
	if (isCompileError(error)) {
		context.status = 1;
		writeDiagnosticsToStderr(context, [error.diagnostic]);
		return;
	}
	if (isShellDiagnosticError(error)) {
		context.status = error.exitCode;
		writeDiagnosticsToStderr(context, error.diagnostics);
		return;
	}
	if (isShellRuntimeError(error)) {
		context.status = error.exitCode;
		if (error.message !== '') {
			context.stderr.append(error.message);
		}
		return;
	}
	context.status = 1;
	throw error;
}
