import {
	compileEffect,
	parseEffect,
	type XargsArgsIR,
	type XargsStep,
} from '@shfs/compiler';
import { Effect } from 'effect';

import type { BuiltinContext } from '../../builtin/types';
import { createShellInput, type ShellInput } from '../../execute/io';
import { evaluateExpandedWordsEffect } from '../../execute/path';
import { collectRecordStream } from '../../execute/record-stream';
import type { FS } from '../../fs/fs';
import { formatRecord, type Record as ShellRecord } from '../../record';
import { BufferedOutputStream } from '../../stderr';
import type { Stream } from '../../stream';

interface RunXargsCommandOptions {
	context: BuiltinContext;
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputPath: string | null;
	parsed: XargsStep['args'];
	stdin?: ShellInput;
}

export interface RunXargsCommandResult {
	exitCode: number;
	stderr: string[];
	stdout: string[];
}

interface TokenizeResult {
	items: string[];
	stopped: boolean;
}

interface TokenizeState {
	current: string;
	escaped: boolean;
	quote: '"' | "'" | null;
}

const DEFAULT_MAX_ARGS = Number.POSITIVE_INFINITY;
const TEXT_DECODER = new TextDecoder();
const WHITESPACE_REGEX = /\s/u;
const LEADING_WHITESPACE_REGEX = /^\s+/u;

export async function runXargsCommand(
	options: RunXargsCommandOptions
): Promise<RunXargsCommandResult> {
	return runXargsCommandInner(options);
}

async function runXargsCommandInner(
	options: RunXargsCommandOptions
): Promise<RunXargsCommandResult> {
	const input = await Effect.runPromise(
		readInputEffect(options).pipe(
			Effect.match({
				onFailure: () => null,
				onSuccess: (text) => text,
			})
		)
	);
	if (input === null) {
		return { exitCode: 1, stderr: [], stdout: [] };
	}
	const command = await Effect.runPromise(
		evaluateExpandedWordsEffect(
			options.parsed.command,
			options.fs,
			options.context
		).pipe(
			Effect.match({
				onFailure: () => null,
				onSuccess: (words) => words,
			})
		)
	);
	if (command === null) {
		return { exitCode: 1, stderr: [], stdout: [] };
	}
	const batches = buildBatches(input, options.parsed);
	if (batches === null) {
		return { exitCode: 1, stderr: [], stdout: [] };
	}

	if (batches.length === 0 && options.parsed.noRunIfEmpty) {
		return { exitCode: 0, stderr: [], stdout: [] };
	}

	const stdout: string[] = [];
	const stderr: string[] = [];
	let exitCode = 0;
	for (const batch of batches.length > 0 ? batches : [[]]) {
		const commandArgs = buildCommandArgs(command, batch, options.parsed);
		const result = await runCommand(
			commandArgs,
			options.fs,
			options.context
		);
		stdout.push(...result.stdout);
		stderr.push(...result.stderr);
		if (result.exitCode !== 0) {
			exitCode = result.exitCode;
		}
	}

	return { exitCode, stderr, stdout };
}

function readInputEffect(
	options: RunXargsCommandOptions
): Effect.Effect<string, unknown> {
	return Effect.gen(function* () {
		if (options.inputPath) {
			return TEXT_DECODER.decode(
				yield* Effect.tryPromise({
					try: () => options.fs.readFile(options.inputPath ?? ''),
					catch: (cause) => cause,
				})
			);
		}
		if (!options.input) {
			return '';
		}

		const records: string[] = [];
		yield* Effect.tryPromise({
			try: async () => {
				for await (const line of (
					options.stdin ?? createShellInput(options.input)
				).lines()) {
					records.push(line);
				}
			},
			catch: (cause) => cause,
		});
		return records.join('\n');
	});
}

function buildBatches(input: string, args: XargsArgsIR): string[][] | null {
	if (args.replace) {
		return replacementBatches(input, args);
	}
	if (args.maxLines) {
		return lineBatches(input, args);
	}

	const items =
		args.delimiter === null
			? tokenize(input, args.eof)?.items
			: splitDelimited(input, args.delimiter);
	if (!items) {
		return null;
	}
	return chunkItems(items, args.maxArgs ?? DEFAULT_MAX_ARGS);
}

function replacementBatches(input: string, args: XargsArgsIR): string[][] {
	const batches: string[][] = [];
	for (const line of splitInputLines(input)) {
		const item = line.replace(LEADING_WHITESPACE_REGEX, '');
		if (item === '') {
			continue;
		}
		if (args.eof !== null && item === args.eof) {
			break;
		}
		batches.push([item]);
	}
	return batches;
}

function lineBatches(input: string, args: XargsArgsIR): string[][] | null {
	const batches: string[][] = [];
	let current: string[] = [];
	let lineCount = 0;

	for (const line of splitInputLines(input)) {
		const parsed = tokenize(line, args.eof);
		if (!parsed) {
			return null;
		}
		if (parsed.items.length === 0) {
			if (parsed.stopped) {
				break;
			}
			continue;
		}

		current.push(...parsed.items);
		lineCount++;
		if (lineCount >= (args.maxLines ?? 1)) {
			batches.push(current);
			current = [];
			lineCount = 0;
		}
		if (parsed.stopped) {
			break;
		}
	}

	if (current.length > 0) {
		batches.push(current);
	}
	return batches;
}

function chunkItems(items: string[], maxArgs: number): string[][] {
	if (items.length === 0) {
		return [];
	}
	if (!Number.isFinite(maxArgs)) {
		return [items];
	}

	const chunks: string[][] = [];
	for (let index = 0; index < items.length; index += maxArgs) {
		chunks.push(items.slice(index, index + maxArgs));
	}
	return chunks;
}

function splitDelimited(input: string, delimiter: string): string[] {
	if (delimiter === '') {
		return input === '' ? [] : [input];
	}

	const parts = input.split(delimiter);
	if (input.endsWith(delimiter)) {
		parts.pop();
	}
	return parts;
}

function splitInputLines(input: string): string[] {
	const lines = input.split('\n');
	if (input.endsWith('\n')) {
		lines.pop();
	}
	return lines;
}

function tokenize(input: string, eof: string | null): TokenizeResult | null {
	const items: string[] = [];
	const state: TokenizeState = {
		current: '',
		escaped: false,
		quote: null,
	};

	for (const char of input) {
		if (state.escaped) {
			appendEscapedChar(state, char);
			continue;
		}
		if (state.quote) {
			appendQuotedChar(state, char);
			continue;
		}

		if (WHITESPACE_REGEX.test(char)) {
			const stopped = pushToken(items, state.current, eof);
			state.current = '';
			if (stopped) {
				return { items, stopped: true };
			}
			continue;
		}
		appendUnquotedChar(state, char);
	}

	if (state.quote) {
		return null;
	}
	if (state.escaped) {
		return null;
	}
	return { items, stopped: pushToken(items, state.current, eof) };
}

function appendEscapedChar(state: TokenizeState, char: string): void {
	state.current += char;
	state.escaped = false;
}

function appendQuotedChar(state: TokenizeState, char: string): void {
	if (char === state.quote) {
		state.quote = null;
		return;
	}
	if (char === '\\') {
		state.escaped = true;
		return;
	}
	state.current += char;
}

function appendUnquotedChar(state: TokenizeState, char: string): void {
	if (char === '"' || char === "'") {
		state.quote = char;
		return;
	}
	if (char === '\\') {
		state.escaped = true;
		return;
	}
	state.current += char;
}

function pushToken(
	items: string[],
	token: string,
	eof: string | null
): boolean {
	if (token === '') {
		return false;
	}
	if (eof !== null && token === eof) {
		return true;
	}
	items.push(token);
	return false;
}

function buildCommandArgs(
	command: string[],
	batch: string[],
	args: XargsArgsIR
): string[] {
	if (!args.replace) {
		return [...command, ...batch];
	}
	return command.map((part) =>
		part.replaceAll(args.replace ?? '', batch[0] ?? '')
	);
}

async function runCommand(
	argv: string[],
	fs: FS,
	context: BuiltinContext
): Promise<RunXargsCommandResult> {
	if (argv.length === 0) {
		return { exitCode: 0, stderr: [], stdout: [] };
	}

	const childContext: BuiltinContext = {
		cwd: context.cwd,
		globalVars: context.globalVars,
		localVars: context.localVars,
		status: context.status,
		stderr: new BufferedOutputStream(),
	};
	const executeModule = await import('../../execute/execute');
	const ir = await Effect.runPromise(
		Effect.gen(function* () {
			const parsed = yield* parseEffect(
				argv.map(quoteShellWord).join(' ')
			);
			return yield* compileEffect(parsed);
		}).pipe(
			Effect.match({
				onFailure: () => null,
				onSuccess: (script) => script,
			})
		)
	);
	if (ir === null) {
		return { exitCode: 1, stderr: [], stdout: [] };
	}
	const result = executeModule.execute(ir, fs, childContext);
	const stdout = await collectStdout(result);
	return {
		exitCode: childContext.status,
		stderr: [...childContext.stderr.snapshot()],
		stdout,
	};
}

async function collectStdout(
	result: ReturnType<typeof import('../../execute/execute').execute>
): Promise<string[]> {
	const records = await Effect.runPromise(collectRecordStream(result));
	return records.map((record) => formatRecord(record));
}

function quoteShellWord(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
