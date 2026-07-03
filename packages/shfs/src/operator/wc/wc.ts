import { expandedWordToString, type WcArgsIR } from '@shfs/compiler';
import { Result } from 'better-result';

import type { BuiltinContext } from '../../builtin/types';
import { createShellInput, type ShellInput } from '../../execute/io';
import {
	evaluateExpandedPathWords,
	resolvePathFromCwd,
} from '../../execute/path';
import type { FS } from '../../fs/fs';
import type { Record as ShellRecord } from '../../record';
import type { Stream } from '../../stream';

export interface RunWcCommandOptions {
	context: BuiltinContext;
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputPath: string | null;
	parsed: WcArgsIR;
	stdin?: ShellInput;
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
const DEFAULT_STDIN_DISPLAY_PATH: null = null;
const DEFAULT_STDIO_BYTES = new Uint8Array();
const STDIN_FILE_NAME = '-';
const NUL_BYTE = 0;
const NEWLINE_BYTE = 10;
const DEFAULT_STDIN_FIELD_WIDTH = 7;
const TAB_WIDTH = 8;
const ASCII_CONTROL_MAX = 0x1f;
const DELETE_CHARACTER = 0x7f;
const C1_CONTROL_MIN = 0x80;
const C1_CONTROL_MAX = 0x9f;
const WORD_SEPARATOR_REGEX = /[\s\u00a0\u2007\u202f\u2060]+/u;
const COMBINING_MARK_REGEX = /^\p{Mark}$/u;
const DEFAULT_IGNORABLE_CODE_POINT_REGEX =
	/^\p{Default_Ignorable_Code_Point}$/u;
const WIDE_CHARACTER_RANGES = [
	[0x11_00, 0x11_5f],
	[0x23_1a, 0x23_1b],
	[0x23_29, 0x23_2a],
	[0x23_e9, 0x23_ec],
	[0x23_f0, 0x23_f0],
	[0x23_f3, 0x23_f3],
	[0x25_fd, 0x25_fe],
	[0x26_14, 0x26_15],
	[0x26_48, 0x26_53],
	[0x26_7f, 0x26_7f],
	[0x26_93, 0x26_93],
	[0x26_a1, 0x26_a1],
	[0x26_aa, 0x26_ab],
	[0x26_bd, 0x26_be],
	[0x26_c4, 0x26_c5],
	[0x26_ce, 0x26_ce],
	[0x26_d4, 0x26_d4],
	[0x26_ea, 0x26_ea],
	[0x26_f2, 0x26_f3],
	[0x26_f5, 0x26_f5],
	[0x26_fa, 0x26_fa],
	[0x26_fd, 0x26_fd],
	[0x27_05, 0x27_05],
	[0x27_0a, 0x27_0b],
	[0x27_28, 0x27_28],
	[0x27_4c, 0x27_4c],
	[0x27_4e, 0x27_4e],
	[0x27_53, 0x27_55],
	[0x27_57, 0x27_57],
	[0x27_95, 0x27_97],
	[0x27_b0, 0x27_b0],
	[0x27_bf, 0x27_bf],
	[0x2b_1b, 0x2b_1c],
	[0x2b_50, 0x2b_50],
	[0x2b_55, 0x2b_55],
	[0x2e_80, 0x30_3e],
	[0x30_40, 0xa4_cf],
	[0xac_00, 0xd7_a3],
	[0xf9_00, 0xfa_ff],
	[0xfe_10, 0xfe_19],
	[0xfe_30, 0xfe_6f],
	[0xff_00, 0xff_60],
	[0xff_e0, 0xff_e6],
	[0x1_6f_e0, 0x1_6f_e4],
	[0x1_6f_f0, 0x1_6f_f1],
	[0x1_70_00, 0x1_87_f7],
	[0x1_88_00, 0x1_8c_d5],
	[0x1_8d_00, 0x1_8d_08],
	[0x1_af_f0, 0x1_af_f3],
	[0x1_af_f5, 0x1_af_fb],
	[0x1_af_fd, 0x1_af_fe],
	[0x1_b0_00, 0x1_b1_22],
	[0x1_b1_32, 0x1_b1_32],
	[0x1_b1_50, 0x1_b1_52],
	[0x1_b1_55, 0x1_b1_55],
	[0x1_b1_64, 0x1_b1_67],
	[0x1_b1_70, 0x1_b2_fb],
	[0x1_f0_04, 0x1_f0_04],
	[0x1_f0_cf, 0x1_f0_cf],
	[0x1_f1_8e, 0x1_f1_8e],
	[0x1_f1_91, 0x1_f1_9a],
	[0x1_f2_00, 0x1_f2_02],
	[0x1_f2_10, 0x1_f2_3b],
	[0x1_f2_40, 0x1_f2_48],
	[0x1_f2_50, 0x1_f2_51],
	[0x1_f2_60, 0x1_f2_65],
	[0x1_f3_00, 0x1_f6_ff],
	[0x1_f9_00, 0x1_f9_ff],
	[0x1_fa_70, 0x1_fa_ff],
	[0x2_00_00, 0x3_ff_fd],
] as const;

export async function runWcCommand(
	options: RunWcCommandOptions
): Promise<RunWcCommandResult> {
	const selection = normalizeSelection(options.parsed);
	const stderr: string[] = [];
	const redirectedInputBytes = options.inputPath
		? await readFileOrReport(
				options.fs,
				options.inputPath,
				options.inputPath,
				stderr
			)
		: null;
	if (redirectedInputBytes === null && options.inputPath) {
		return { exitCode: 1, stderr, stdout: [] };
	}
	const readStdinBytes = createStdinReader(
		options.input,
		redirectedInputBytes,
		options.stdin
	);
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
		readStdinBytes,
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
		if (target.displayPath === STDIN_FILE_NAME) {
			const bytes = await readStdinBytes();
			countedInputs.push({
				counts: countBytes(bytes),
				displayPath: target.displayPath,
			});
			continue;
		}
		const resolvedPath = resolvePathFromCwd(
			options.context.cwd,
			target.path
		);
		const bytes = await readFileOrReport(
			options.fs,
			resolvedPath,
			target.displayPath,
			stderr
		);
		if (bytes === null) {
			hadError = true;
		} else {
			countedInputs.push({
				counts: countBytes(bytes),
				displayPath: target.displayPath,
			});
		}
	}

	if (source.targets.length === 0 && !source.fromFiles0) {
		const bytes = await readStdinBytes();
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
	readStdinBytes: () => Promise<Uint8Array>;
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
		namesBytes = await options.readStdinBytes();
	} else {
		const path = resolvePathFromCwd(options.context.cwd, files0From);
		const loadedNames = await readFileOrReport(
			options.fs,
			path,
			files0From,
			options.stderr
		);
		if (loadedNames === null) {
			return null;
		}
		namesBytes = loadedNames;
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

async function readFileOrReport(
	fs: FS,
	path: string,
	displayPath: string,
	stderr: string[]
): Promise<Uint8Array | null> {
	const result = await Result.tryPromise({
		try: () => fs.readFile(path),
		catch: (error) => error,
	});
	return result.match({
		err: () => {
			stderr.push(`wc: ${displayPath}: No such file or directory`);
			return null;
		},
		ok: (bytes) => bytes,
	});
}

function createStdinReader(
	input: Stream<ShellRecord> | null,
	redirectedInputBytes: Uint8Array | null,
	stdin: ShellInput | undefined
): () => Promise<Uint8Array> {
	let hasRead = false;
	return async () => {
		if (hasRead) {
			return DEFAULT_STDIO_BYTES;
		}
		hasRead = true;
		return redirectedInputBytes ?? readStreamBytes(input, stdin);
	};
}

async function readStreamBytes(
	input: Stream<ShellRecord> | null,
	stdin: ShellInput | undefined
): Promise<Uint8Array> {
	if (!input) {
		return DEFAULT_STDIO_BYTES;
	}
	return await (stdin ?? createShellInput(input)).bytes({
		trailingNewline: true,
	});
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
	let linePosition = 0;
	for (const character of text) {
		switch (character) {
			case '\n':
			case '\r':
			case '\f':
				if (linePosition > maxLength) {
					maxLength = linePosition;
				}
				linePosition = 0;
				break;
			case '\t':
				linePosition += TAB_WIDTH - (linePosition % TAB_WIDTH);
				break;
			case '\v':
				break;
			case ' ':
				linePosition++;
				break;
			default:
				linePosition += displayWidth(character);
		}
	}
	if (linePosition > maxLength) {
		maxLength = linePosition;
	}
	return maxLength;
}

function displayWidth(character: string): number {
	const codePoint = character.codePointAt(0);
	if (codePoint === undefined || isControlCodePoint(codePoint)) {
		return 0;
	}
	if (
		COMBINING_MARK_REGEX.test(character) ||
		DEFAULT_IGNORABLE_CODE_POINT_REGEX.test(character)
	) {
		return 0;
	}
	if (isWideCodePoint(codePoint)) {
		return 2;
	}
	return 1;
}

function isControlCodePoint(codePoint: number): boolean {
	return (
		codePoint <= ASCII_CONTROL_MAX ||
		codePoint === DELETE_CHARACTER ||
		(codePoint >= C1_CONTROL_MIN && codePoint <= C1_CONTROL_MAX)
	);
}

function isWideCodePoint(codePoint: number): boolean {
	for (const [start, end] of WIDE_CHARACTER_RANGES) {
		if (codePoint >= start && codePoint <= end) {
			return true;
		}
	}
	return false;
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
		return true;
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
