import {
	compile,
	parse,
	type XargsArgsIR,
	type XargsStep,
} from '@shfs/compiler';

import type { BuiltinContext } from '../../builtin/types';
import { evaluateExpandedWords } from '../../execute/path';
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
	try {
		return await runXargsCommandInner(options);
	} catch {
		return { exitCode: 1, stderr: [], stdout: [] };
	}
}

async function runXargsCommandInner(
	options: RunXargsCommandOptions
): Promise<RunXargsCommandResult> {
	const input = await readInput(options);
	const command = await evaluateExpandedWords(
		options.parsed.command,
		options.fs,
		options.context
	);
	const batches = buildBatches(input, options.parsed);

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

async function readInput(options: RunXargsCommandOptions): Promise<string> {
	if (options.inputPath) {
		return TEXT_DECODER.decode(
			await options.fs.readFile(options.inputPath)
		);
	}
	if (!options.input) {
		return '';
	}

	const records: string[] = [];
	for await (const record of options.input) {
		records.push(formatRecord(record));
	}
	return records.join('\n');
}

function buildBatches(input: string, args: XargsArgsIR): string[][] {
	if (args.replace) {
		return replacementBatches(input, args);
	}
	if (args.maxLines) {
		return lineBatches(input, args);
	}

	const items =
		args.delimiter === null
			? tokenize(input, args.eof).items
			: splitDelimited(input, args.delimiter);
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

function lineBatches(input: string, args: XargsArgsIR): string[][] {
	const batches: string[][] = [];
	let current: string[] = [];
	let lineCount = 0;

	for (const line of splitInputLines(input)) {
		const parsed = tokenize(line, args.eof);
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

function tokenize(input: string, eof: string | null): TokenizeResult {
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
		throw new Error(`xargs: unterminated quote ${state.quote}`);
	}
	if (state.escaped) {
		throw new Error('xargs: unterminated escape');
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
	const result = executeModule.execute(
		compile(parse(argv.map(quoteShellWord).join(' '))),
		fs,
		childContext
	);
	const stdout = await collectStdout(result);
	return {
		exitCode: childContext.status,
		stderr: childContext.stderr.snapshot(),
		stdout,
	};
}

async function collectStdout(
	result: ReturnType<typeof import('../../execute/execute').execute>
): Promise<string[]> {
	if (result.kind === 'sink') {
		await result.value;
		return [];
	}

	const stdout: string[] = [];
	for await (const record of result.value) {
		stdout.push(formatRecord(record));
	}
	return stdout;
}

function quoteShellWord(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
