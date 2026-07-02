import type { SortArgsIR, SortKeyIR } from '@shfs/compiler';
import { Effect } from 'effect';

import type { BuiltinContext } from '../../builtin/types';
import { createShellInput, type ShellInput } from '../../execute/io';
import {
	evaluateExpandedPathWords,
	resolvePathFromCwd,
} from '../../execute/path';
import type { FS } from '../../fs/fs';
import type { Record as ShellRecord } from '../../record';
import type { Stream } from '../../stream';

export interface RunSortCommandOptions {
	context: BuiltinContext;
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputPath: string | null;
	parsed: SortArgsIR;
	stdin?: ShellInput;
}

export interface RunSortCommandResult {
	exitCode: number;
	stderr: string[];
	stdout: string[];
}

interface FieldLayout {
	ends: number[];
	starts: number[];
}

interface SortInputResult {
	exitCode: number;
	lines: string[];
	stderr: string[];
}

interface StdinLineReader {
	displayPath: string | null;
	read(): AsyncIterable<string>;
}

interface NumericValue {
	fraction: string;
	integer: string;
	sign: -1 | 0 | 1;
}

interface SortValue {
	bytes: Uint8Array;
	numeric: NumericValue;
}

interface SortLine {
	keyValues: SortValue[];
	text: string;
	value: SortValue;
}

const STDIN_FILE_NAME = '-';
const UTF8_ENCODER = new TextEncoder();

export async function runSortCommand(
	options: RunSortCommandOptions
): Promise<RunSortCommandResult> {
	if (options.parsed.diagnostics.length > 0) {
		return {
			exitCode: 2,
			stderr: options.parsed.diagnostics.map(
				(diagnostic) => `sort: ${diagnostic.message}`
			),
			stdout: [],
		};
	}

	const fileOperands = await evaluateExpandedPathWords(
		'sort',
		options.parsed.files,
		options.fs,
		options.context
	);
	const stdinReader = createStdinLineReader(options);

	if (options.parsed.checkMode !== 'none') {
		return runCheckMode(options, fileOperands, stdinReader);
	}

	const input = await collectSortInput(options, fileOperands, stdinReader);
	if (input.exitCode !== 0) {
		return {
			exitCode: input.exitCode,
			stderr: input.stderr,
			stdout: [],
		};
	}

	const sortedLines = sortLines(input.lines, options.parsed);
	const stdout = options.parsed.unique
		? uniqueSortedLines(sortedLines, options.parsed)
		: sortedLines.map((line) => line.text);
	return {
		exitCode: 0,
		stderr: [],
		stdout,
	};
}

async function runCheckMode(
	options: RunSortCommandOptions,
	fileOperands: readonly string[],
	stdinReader: StdinLineReader
): Promise<RunSortCommandResult> {
	if (fileOperands.length > 1) {
		const extraOperand = fileOperands[1] ?? '';
		return {
			exitCode: 2,
			stderr: [
				`sort: extra operand '${extraOperand}' not allowed with -${checkModeOption(options.parsed)}`,
			],
			stdout: [],
		};
	}

	const fileOperand = fileOperands.at(0);
	if (fileOperand === STDIN_FILE_NAME) {
		return checkStdinLines(stdinReader, options.parsed);
	}
	if (fileOperand !== undefined) {
		return checkPathLines(
			options.fs,
			resolvePathFromCwd(options.context.cwd, fileOperand),
			fileOperand,
			options.parsed
		);
	}
	return checkStdinLines(stdinReader, options.parsed);
}

function checkModeOption(args: SortArgsIR): 'c' | 'C' {
	return args.checkMode === 'quiet' ? 'C' : 'c';
}

async function checkStdinLines(
	stdinReader: StdinLineReader,
	args: SortArgsIR
): Promise<RunSortCommandResult> {
	return Effect.runPromise(
		Effect.tryPromise({
			try: () => checkSortedLines(stdinReader.read(), args),
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onFailure: () =>
					createStdinCheckReadError(stdinReader.displayPath),
				onSuccess: (result) => result,
			})
		)
	);
}

async function checkPathLines(
	fs: FS,
	path: string,
	displayPath: string,
	args: SortArgsIR
): Promise<RunSortCommandResult> {
	return Effect.runPromise(
		Effect.tryPromise({
			try: () => checkSortedLines(fs.readLines(path), args),
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onFailure: () => ({
					exitCode: 2,
					stderr: [
						`sort: cannot read: ${displayPath}: No such file or directory`,
					],
					stdout: [],
				}),
				onSuccess: (result) => result,
			})
		)
	);
}

async function checkSortedLines(
	lines: AsyncIterable<string>,
	args: SortArgsIR
): Promise<RunSortCommandResult> {
	let previousLine: SortLine | null = null;
	for await (const text of lines) {
		const currentLine = prepareSortLine(text, args);
		if (previousLine && !isSortedPair(previousLine, currentLine, args)) {
			return {
				exitCode: 1,
				stderr:
					args.checkMode === 'quiet'
						? []
						: [`sort: disorder: ${currentLine.text}`],
				stdout: [],
			};
		}
		previousLine = currentLine;
	}

	return { exitCode: 0, stderr: [], stdout: [] };
}

function isSortedPair(
	previousLine: SortLine,
	currentLine: SortLine,
	args: SortArgsIR
): boolean {
	if (args.unique) {
		return comparePrimary(previousLine, currentLine, args) < 0;
	}
	return compareSortLines(previousLine, currentLine, args) <= 0;
}

async function collectSortInput(
	options: RunSortCommandOptions,
	fileOperands: readonly string[],
	stdinReader: StdinLineReader
): Promise<SortInputResult> {
	if (fileOperands.length > 0) {
		return collectFileOperandLines(options, fileOperands, stdinReader);
	}
	return collectStdinLinesToArray(stdinReader);
}

async function collectFileOperandLines(
	options: RunSortCommandOptions,
	fileOperands: readonly string[],
	stdinReader: StdinLineReader
): Promise<SortInputResult> {
	const lines: string[] = [];
	const stderr: string[] = [];

	for (const operand of fileOperands) {
		if (operand === STDIN_FILE_NAME) {
			const result = await collectStdinLinesToArray(stdinReader);
			if (result.exitCode !== 0) {
				stderr.push(...result.stderr);
				continue;
			}
			lines.push(...result.lines);
			continue;
		}
		const path = resolvePathFromCwd(options.context.cwd, operand);
		const result = await collectPathLines(options.fs, path, operand);
		if (result.exitCode !== 0) {
			stderr.push(...result.stderr);
			continue;
		}
		lines.push(...result.lines);
	}

	return {
		exitCode: stderr.length > 0 ? 2 : 0,
		lines: stderr.length > 0 ? [] : lines,
		stderr,
	};
}

async function collectPathLines(
	fs: FS,
	path: string,
	displayPath: string
): Promise<SortInputResult> {
	return Effect.runPromise(
		Effect.tryPromise({
			try: async () => {
				const lines: string[] = [];
				for await (const line of fs.readLines(path)) {
					lines.push(line);
				}
				return lines;
			},
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onFailure: () => ({
					exitCode: 2,
					lines: [],
					stderr: [
						`sort: cannot read: ${displayPath}: No such file or directory`,
					],
				}),
				onSuccess: (lines) => ({ exitCode: 0, lines, stderr: [] }),
			})
		)
	);
}

function createStdinLineReader(
	options: RunSortCommandOptions
): StdinLineReader {
	let hasRead = false;
	return {
		displayPath: options.inputPath,
		read() {
			if (hasRead) {
				return emptyLines();
			}
			hasRead = true;
			if (options.inputPath) {
				return options.fs.readLines(options.inputPath);
			}
			const stdin = options.stdin ?? createShellInput(options.input);
			return stdin.lines();
		},
	};
}

async function collectStdinLinesToArray(
	stdinReader: StdinLineReader
): Promise<SortInputResult> {
	return Effect.runPromise(
		Effect.tryPromise({
			try: async () => {
				const lines: string[] = [];
				for await (const line of stdinReader.read()) {
					lines.push(line);
				}
				return lines;
			},
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onFailure: () =>
					createStdinInputReadError(stdinReader.displayPath),
				onSuccess: (lines) => ({ exitCode: 0, lines, stderr: [] }),
			})
		)
	);
}

async function* emptyLines(): AsyncIterable<string> {
	// no lines
}

function createStdinCheckReadError(path: string | null): RunSortCommandResult {
	return {
		exitCode: 2,
		stderr: [createStdinReadErrorMessage(path)],
		stdout: [],
	};
}

function createStdinInputReadError(path: string | null): SortInputResult {
	return {
		exitCode: 2,
		lines: [],
		stderr: [createStdinReadErrorMessage(path)],
	};
}

function createStdinReadErrorMessage(path: string | null): string {
	const displayPath = path ?? STDIN_FILE_NAME;
	return `sort: cannot read: ${displayPath}: No such file or directory`;
}

function sortLines(lines: readonly string[], args: SortArgsIR): SortLine[] {
	return lines
		.map((line) => prepareSortLine(line, args))
		.sort((left, right) => compareSortLines(left, right, args));
}

function uniqueSortedLines(
	lines: readonly SortLine[],
	args: SortArgsIR
): string[] {
	const uniqueLines: string[] = [];
	let previous: SortLine | null = null;
	for (const line of lines) {
		if (previous && comparePrimary(previous, line, args) === 0) {
			continue;
		}
		uniqueLines.push(line.text);
		previous = line;
	}
	return uniqueLines;
}

function prepareSortLine(text: string, args: SortArgsIR): SortLine {
	const value = createSortValue(text);
	return {
		keyValues: args.keys.map((key) =>
			createSortValue(extractKey(text, key, args.fieldSeparator))
		),
		text,
		value,
	};
}

function createSortValue(text: string): SortValue {
	return {
		bytes: UTF8_ENCODER.encode(text),
		numeric: parseNumericValue(text),
	};
}

function compareSortLines(
	left: SortLine,
	right: SortLine,
	args: SortArgsIR
): number {
	const primaryComparison = comparePrimary(left, right, args);
	if (primaryComparison !== 0) {
		return primaryComparison;
	}
	if (args.unique) {
		return 0;
	}
	return compareBytes(left.value.bytes, right.value.bytes);
}

function comparePrimary(
	left: SortLine,
	right: SortLine,
	args: SortArgsIR
): number {
	if (args.keys.length === 0) {
		return compareValues(left.value, right.value, args.numeric);
	}

	for (const [index, key] of args.keys.entries()) {
		const leftValue = left.keyValues[index];
		const rightValue = right.keyValues[index];
		if (!(leftValue && rightValue)) {
			continue;
		}
		const comparison = compareValues(
			leftValue,
			rightValue,
			args.numeric || key.options.numeric
		);
		if (comparison !== 0) {
			return comparison;
		}
	}
	return 0;
}

function compareValues(
	left: SortValue,
	right: SortValue,
	numeric: boolean
): number {
	if (numeric) {
		return compareNumericValues(left.numeric, right.numeric);
	}
	return compareBytes(left.bytes, right.bytes);
}

function compareNumericValues(left: NumericValue, right: NumericValue): number {
	if (left.sign !== right.sign) {
		return left.sign - right.sign;
	}
	if (left.sign === 0) {
		return 0;
	}
	const magnitudeComparison = compareNumericMagnitude(left, right);
	return left.sign > 0 ? magnitudeComparison : -magnitudeComparison;
}

function compareNumericMagnitude(
	left: NumericValue,
	right: NumericValue
): number {
	if (left.integer.length !== right.integer.length) {
		return left.integer.length - right.integer.length;
	}
	const integerComparison = compareAsciiDigits(left.integer, right.integer);
	if (integerComparison !== 0) {
		return integerComparison;
	}
	const maxFractionLength = Math.max(
		left.fraction.length,
		right.fraction.length
	);
	for (let index = 0; index < maxFractionLength; index += 1) {
		const leftDigit = digitValue(left.fraction.at(index));
		const rightDigit = digitValue(right.fraction.at(index));
		if (leftDigit !== rightDigit) {
			return leftDigit - rightDigit;
		}
	}
	return 0;
}

function compareAsciiDigits(left: string, right: string): number {
	for (let index = 0; index < left.length; index += 1) {
		const difference =
			digitValue(left.at(index)) - digitValue(right.at(index));
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

function parseNumericValue(value: string): NumericValue {
	let index = skipLeadingBlanks(value);
	let sign: -1 | 1 = 1;
	const signCharacter = value.at(index);
	if (signCharacter === '-') {
		sign = -1;
		index += 1;
	}

	const integerStart = index;
	while (isAsciiDigit(value.at(index))) {
		index += 1;
	}
	const integer = value.slice(integerStart, index);

	let fraction = '';
	if (value.at(index) === '.') {
		index += 1;
		const fractionStart = index;
		while (isAsciiDigit(value.at(index))) {
			index += 1;
		}
		fraction = value.slice(fractionStart, index);
	}

	if (integer === '' && fraction === '') {
		return createZeroNumericValue();
	}

	const normalizedInteger = integer.replace(/^0+/g, '');
	const normalizedFraction = fraction.replace(/0+$/g, '');
	if (normalizedInteger === '' && normalizedFraction === '') {
		return createZeroNumericValue();
	}

	return {
		fraction: normalizedFraction,
		integer: normalizedInteger,
		sign,
	};
}

function createZeroNumericValue(): NumericValue {
	return {
		fraction: '',
		integer: '',
		sign: 0,
	};
}

function skipLeadingBlanks(value: string): number {
	let index = 0;
	while (isBlank(value.at(index))) {
		index += 1;
	}
	return index;
}

function isAsciiDigit(character: string | undefined): boolean {
	return character !== undefined && character >= '0' && character <= '9';
}

function digitValue(character: string | undefined): number {
	return character === undefined ? 0 : character.charCodeAt(0) - 48;
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
	const length = Math.min(left.byteLength, right.byteLength);
	for (let index = 0; index < length; index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return left.byteLength - right.byteLength;
}

function extractKey(
	line: string,
	key: SortKeyIR,
	fieldSeparator: string | null
): string {
	const layout = createFieldLayout(line, fieldSeparator);
	const start = keyPositionToStartIndex(line, layout, key.start);
	const end = key.end
		? keyPositionToEndIndex(line, layout, key.end)
		: line.length;
	if (end < start) {
		return '';
	}
	return line.slice(start, end);
}

function keyPositionToStartIndex(
	line: string,
	layout: FieldLayout,
	position: SortKeyIR['start']
): number {
	const fieldStart = fieldStartIndex(layout, position.field, line.length);
	if (position.character === null) {
		return fieldStart;
	}
	return Math.min(fieldStart + position.character - 1, line.length);
}

function keyPositionToEndIndex(
	line: string,
	layout: FieldLayout,
	position: SortKeyIR['start']
): number {
	const fieldStart = fieldStartIndex(layout, position.field, line.length);
	if (position.character === null || position.character === 0) {
		return fieldEndIndex(layout, position.field, line.length);
	}
	return Math.min(fieldStart + position.character, line.length);
}

function createFieldLayout(
	line: string,
	fieldSeparator: string | null
): FieldLayout {
	if (fieldSeparator !== null) {
		return createSeparatedFieldLayout(line, fieldSeparator);
	}
	return createBlankDelimitedFieldLayout(line);
}

function createSeparatedFieldLayout(
	line: string,
	fieldSeparator: string
): FieldLayout {
	if (fieldSeparator === '') {
		return { ends: [line.length], starts: [0] };
	}

	const starts = [0];
	const ends: number[] = [];
	let index = 0;
	while (index < line.length) {
		if (!line.startsWith(fieldSeparator, index)) {
			index += 1;
			continue;
		}
		ends.push(index);
		index += fieldSeparator.length;
		starts.push(index);
	}
	ends.push(line.length);
	return { ends, starts };
}

function createBlankDelimitedFieldLayout(line: string): FieldLayout {
	const starts = [0];
	const ends: number[] = [];
	let index = 0;

	while (index < line.length) {
		if (!isBlank(line.at(index))) {
			index += 1;
			continue;
		}
		const blankStart = index;
		while (index < line.length && isBlank(line.at(index))) {
			index += 1;
		}
		if (blankStart === 0) {
			continue;
		}
		if (index >= line.length) {
			continue;
		}
		ends.push(blankStart);
		starts.push(blankStart);
	}

	while (ends.length < starts.length) {
		ends.push(line.length);
	}
	return { ends, starts };
}

function isBlank(character: string | undefined): boolean {
	return character === ' ' || character === '\t';
}

function fieldStartIndex(
	layout: FieldLayout,
	field: number,
	lineLength: number
): number {
	return layout.starts[field - 1] ?? lineLength;
}

function fieldEndIndex(
	layout: FieldLayout,
	field: number,
	lineLength: number
): number {
	return layout.ends[field - 1] ?? lineLength;
}
