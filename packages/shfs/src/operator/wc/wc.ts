import { expandedWordToString, type WcArgsIR } from '@shfs/compiler';

import type { BuiltinContext } from '../../builtin/types';
import {
	evaluateExpandedPathWords,
	resolvePathFromCwd,
} from '../../execute/path';
import { formatRecord } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type { Record as ShellRecord } from '../../record';
import type { Stream } from '../../stream';

export interface RunWcCommandOptions {
	context: BuiltinContext;
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputPath: string | null;
	parsed: WcArgsIR;
}

export interface RunWcCommandResult {
	exitCode: number;
	stderr: string[];
	stdout: string[];
}

interface Counts {
	bytes: number;
	chars: number;
	lines: number;
	maxLineLength: number;
	words: number;
}

interface CountedInput {
	counts: Counts;
	displayPath: string | null;
}

interface ParsedNames {
	invalidNameCount: number;
	names: string[];
}

interface WcFieldSelection {
	bytes: boolean;
	chars: boolean;
	lines: boolean;
	maxLineLength: boolean;
	words: boolean;
}

const UTF8_DECODER = new TextDecoder();
const UTF8_ENCODER = new TextEncoder();
const DEFAULT_STDIN_DISPLAY_PATH: null = null;
const DEFAULT_STDIO_BYTES = new Uint8Array();
const STDIN_FILE_NAME = '-';
const NUL_BYTE = 0;
const NEWLINE_BYTE = 10;
const DEFAULT_STDIN_FIELD_WIDTH = 7;
const WORD_SEPARATOR_REGEX = /[\s\u00a0\u2007\u202f\u2060]+/u;

export async function runWcCommand(
	options: RunWcCommandOptions
): Promise<RunWcCommandResult> {
	const selection = normalizeSelection(options.parsed);
	const stderr: string[] = [];
	const fileOperands = await evaluateExpandedPathWords(
		'wc',
		options.parsed.files,
		options.fs,
		options.context
	);

	if (options.parsed.files0From && fileOperands.length > 0) {
		return {
			exitCode: 1,
			stderr: [
				`wc: extra operand '${fileOperands[0]}'`,
				'file operands cannot be combined with --files0-from',
			],
			stdout: [],
		};
	}
	if (options.parsed.total === 'invalid') {
		return {
			exitCode: 1,
			stderr: ['wc: option --total requires an argument'],
			stdout: [],
		};
	}

	const source = await resolveInputSource({
		...options,
		fileOperands,
		stderr,
	});
	if (source === null) {
		return { exitCode: 1, stderr, stdout: [] };
	}

	const countedInputs: CountedInput[] = [];
	let hadError = stderr.length > 0;
	for (const target of source.targets) {
		if (source.files0FromStdin && target.displayPath === STDIN_FILE_NAME) {
			stderr.push(
				"wc: when reading file names from standard input, no file name of '-' allowed"
			);
			hadError = true;
			continue;
		}
		const resolvedPath = resolvePathFromCwd(
			options.context.cwd,
			target.path
		);
		try {
			const bytes = await options.fs.readFile(resolvedPath);
			countedInputs.push({
				counts: countBytes(bytes),
				displayPath: target.displayPath,
			});
		} catch {
			stderr.push(`wc: ${target.displayPath}: No such file or directory`);
			hadError = true;
		}
	}

	if (source.targets.length === 0 && !source.fromFiles0) {
		const bytes = options.inputPath
			? await readFileOrEmpty(options.fs, options.inputPath)
			: await readStreamBytes(options.input);
		countedInputs.push({
			counts: countBytes(bytes),
			displayPath: DEFAULT_STDIN_DISPLAY_PATH,
		});
	}

	const stdout = renderOutput(
		countedInputs,
		selection,
		options.parsed.total,
		source.fromFiles0,
		source.operandCount
	);
	return {
		exitCode: hadError ? 1 : 0,
		stderr,
		stdout,
	};
}

async function resolveInputSource(options: {
	context: BuiltinContext;
	fileOperands: string[];
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputPath: string | null;
	parsed: WcArgsIR;
	stderr: string[];
}): Promise<{
	files0FromStdin: boolean;
	fromFiles0: boolean;
	operandCount: number;
	targets: { displayPath: string; path: string }[];
} | null> {
	if (!options.parsed.files0From) {
		return {
			files0FromStdin: false,
			fromFiles0: false,
			operandCount: options.fileOperands.length,
			targets: options.fileOperands.map((path) => ({
				displayPath: path,
				path,
			})),
		};
	}

	const files0From = expandedWordToString(options.parsed.files0From);
	const files0FromStdin = files0From === STDIN_FILE_NAME;
	let namesBytes: Uint8Array;
	if (files0FromStdin) {
		namesBytes = options.inputPath
			? await readFileOrEmpty(options.fs, options.inputPath)
			: await readStreamBytes(options.input);
	} else {
		const path = resolvePathFromCwd(options.context.cwd, files0From);
		try {
			namesBytes = await options.fs.readFile(path);
		} catch {
			options.stderr.push(`wc: ${files0From}: No such file or directory`);
			return null;
		}
	}

	const names = parseNulSeparatedNames(namesBytes, options.stderr);
	return {
		files0FromStdin,
		fromFiles0: true,
		operandCount: names.names.length + names.invalidNameCount,
		targets: names.names.map((path) => ({
			displayPath: path,
			path,
		})),
	};
}

function parseNulSeparatedNames(
	bytes: Uint8Array,
	stderr: string[]
): ParsedNames {
	if (bytes.byteLength === 0) {
		return { invalidNameCount: 0, names: [] };
	}

	const names: string[] = [];
	let invalidNameCount = 0;
	let start = 0;
	for (let index = 0; index < bytes.byteLength; index++) {
		if (bytes[index] !== NUL_BYTE) {
			continue;
		}
		invalidNameCount += appendName(
			bytes.slice(start, index),
			names,
			stderr
		);
		start = index + 1;
	}
	if (start < bytes.byteLength) {
		invalidNameCount += appendName(bytes.slice(start), names, stderr);
	}
	return { invalidNameCount, names };
}

function appendName(
	bytes: Uint8Array,
	names: string[],
	stderr: string[]
): number {
	if (bytes.byteLength === 0) {
		stderr.push('wc: invalid zero-length file name');
		return 1;
	}
	names.push(UTF8_DECODER.decode(bytes));
	return 0;
}

async function readFileOrEmpty(fs: FS, path: string): Promise<Uint8Array> {
	try {
		return await fs.readFile(path);
	} catch {
		return DEFAULT_STDIO_BYTES;
	}
}

async function readStreamBytes(
	input: Stream<ShellRecord> | null
): Promise<Uint8Array> {
	if (!input) {
		return DEFAULT_STDIO_BYTES;
	}
	const textParts: string[] = [];
	for await (const record of input) {
		textParts.push(formatRecord(record));
	}
	return UTF8_ENCODER.encode(textParts.join('\n'));
}

function countBytes(bytes: Uint8Array): Counts {
	const text = UTF8_DECODER.decode(bytes);
	return {
		bytes: bytes.byteLength,
		chars: [...text].length,
		lines: countLines(bytes),
		maxLineLength: countMaxLineLength(text),
		words: countWords(text),
	};
}

function countLines(bytes: Uint8Array): number {
	let lines = 0;
	for (const byte of bytes) {
		if (byte === NEWLINE_BYTE) {
			lines++;
		}
	}
	return lines;
}

function countWords(text: string): number {
	return text.split(WORD_SEPARATOR_REGEX).filter((word) => word.length > 0)
		.length;
}

function countMaxLineLength(text: string): number {
	let maxLength = 0;
	for (const line of text.split('\n')) {
		const lineLength = [...line].length;
		if (lineLength > maxLength) {
			maxLength = lineLength;
		}
	}
	return maxLength;
}

function normalizeSelection(parsed: WcArgsIR): WcFieldSelection {
	const hasExplicitSelection =
		parsed.bytes ||
		parsed.chars ||
		parsed.lines ||
		parsed.maxLineLength ||
		parsed.words;
	if (hasExplicitSelection) {
		return {
			bytes: parsed.bytes,
			chars: parsed.chars,
			lines: parsed.lines,
			maxLineLength: parsed.maxLineLength,
			words: parsed.words,
		};
	}
	return {
		bytes: true,
		chars: false,
		lines: true,
		maxLineLength: false,
		words: true,
	};
}

function renderOutput(
	inputs: readonly CountedInput[],
	selection: WcFieldSelection,
	totalMode: WcArgsIR['total'],
	fromFiles0: boolean,
	operandCount: number
): string[] {
	const includeTotal = shouldIncludeTotal(operandCount, totalMode);
	const totals = sumCounts(inputs);
	if (totalMode === 'only') {
		return [renderCounts(totals, selection, 1, null)];
	}
	if (inputs.length === 0 && !includeTotal) {
		return [];
	}

	const width = fieldWidth(inputs, totals, selection, fromFiles0);
	const lines = inputs.map((input) =>
		renderCounts(
			input.counts,
			selection,
			width,
			input.displayPath ? quoteDisplayPath(input.displayPath) : null
		)
	);
	if (includeTotal) {
		lines.push(renderCounts(totals, selection, width, 'total'));
	}
	return lines;
}

function shouldIncludeTotal(
	operandCount: number,
	totalMode: WcArgsIR['total']
): boolean {
	if (totalMode === 'never' || totalMode === 'only') {
		return false;
	}
	if (totalMode === 'always') {
		return operandCount > 0;
	}
	return operandCount > 1;
}

function sumCounts(inputs: readonly CountedInput[]): Counts {
	const totals: Counts = {
		bytes: 0,
		chars: 0,
		lines: 0,
		maxLineLength: 0,
		words: 0,
	};
	for (const input of inputs) {
		totals.bytes += input.counts.bytes;
		totals.chars += input.counts.chars;
		totals.lines += input.counts.lines;
		totals.words += input.counts.words;
		if (input.counts.maxLineLength > totals.maxLineLength) {
			totals.maxLineLength = input.counts.maxLineLength;
		}
	}
	return totals;
}

function fieldWidth(
	inputs: readonly CountedInput[],
	totals: Counts,
	selection: WcFieldSelection,
	fromFiles0: boolean
): number {
	const hasOnlyStdin =
		inputs.length === 1 &&
		inputs[0]?.displayPath === DEFAULT_STDIN_DISPLAY_PATH;
	if (hasOnlyStdin && selectedFieldCount(selection) > 1) {
		return DEFAULT_STDIN_FIELD_WIDTH;
	}
	if (!fromFiles0 && inputs.length === 1) {
		return 1;
	}
	if (fromFiles0 && selectedFieldCount(selection) === 1) {
		return 1;
	}
	let width = 1;
	for (const input of inputs) {
		width = Math.max(width, maxSelectedDigitCount(input.counts, selection));
	}
	width = Math.max(width, maxSelectedDigitCount(totals, selection));
	return width;
}

function selectedFieldCount(selection: WcFieldSelection): number {
	return selectedValues(
		{ bytes: 0, chars: 0, lines: 0, maxLineLength: 0, words: 0 },
		selection
	).length;
}

function maxSelectedDigitCount(
	counts: Counts,
	selection: WcFieldSelection
): number {
	return Math.max(
		...selectedValues(counts, selection).map(
			(value) => String(value).length
		)
	);
}

function renderCounts(
	counts: Counts,
	selection: WcFieldSelection,
	width: number,
	displayPath: string | null
): string {
	const renderedCounts = selectedValues(counts, selection).map((value) =>
		String(value).padStart(width, ' ')
	);
	const prefix = renderedCounts.join(' ');
	return displayPath ? `${prefix} ${displayPath}` : prefix;
}

function selectedValues(counts: Counts, selection: WcFieldSelection): number[] {
	const values: number[] = [];
	if (selection.lines) {
		values.push(counts.lines);
	}
	if (selection.words) {
		values.push(counts.words);
	}
	if (selection.bytes) {
		values.push(counts.bytes);
	}
	if (selection.chars) {
		values.push(counts.chars);
	}
	if (selection.maxLineLength) {
		values.push(counts.maxLineLength);
	}
	return values;
}

function quoteDisplayPath(path: string): string {
	if (!path.includes('\n')) {
		return path;
	}
	return `'${path.split('\n').join("'$'\\n''")}'`;
}
