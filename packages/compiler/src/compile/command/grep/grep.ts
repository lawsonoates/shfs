import { createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type GrepArgsIR,
	type GrepDiagnosticIR,
	type GrepOptionsIR,
	literal,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import {
	createWordParser,
	type FlagDef,
	type ParseDiagnostic,
	type ParsedValueSource,
	type ParseWordsResult,
} from '../arg/parse';

const CONTEXT_SHORTHAND_REGEX = /^-[0-9]+$/;
const UNKNOWN_FLAG_PREFIX = 'Unknown flag:';

type ParsedGrepWords = ParseWordsResult<ExpandedWord>;
type GrepDiagnosticCode = 'invalid-value' | 'missing-value' | 'unknown-option';

interface ValueFlagOccurrence {
	order: number;
	source: ParsedValueSource;
	token: string;
	tokenIndex: number;
	value: string;
	valueIndex: number;
}

interface ContextAssignment {
	kind: 'after' | 'before' | 'both';
	tokenIndex: number;
	value: number;
}

const DEFAULT_OPTIONS: GrepOptionsIR = {
	afterContext: 0,
	beforeContext: 0,
	binaryWithoutMatch: false,
	byteOffset: false,
	countOnly: false,
	directories: 'read',
	excludeDir: [],
	excludeFiles: [],
	filenameMode: 'default',
	help: false,
	ignoreCase: false,
	includeFiles: [],
	invertMatch: false,
	lineNumber: false,
	lineRegexp: false,
	listFilesWithMatches: false,
	listFilesWithoutMatch: false,
	maxCount: null,
	mode: 'bre',
	noMessages: false,
	nullData: false,
	onlyMatching: false,
	quiet: false,
	recursive: false,
	textMode: false,
	version: false,
	wordRegexp: false,
};

const GREP_FLAG_DEFS: Record<string, FlagDef> = {
	afterContext: grepValueFlag({ long: 'after-context', short: 'A' }),
	beforeContext: grepValueFlag({ long: 'before-context', short: 'B' }),
	binaryFile: grepValueFlag({ long: 'binary-file' }),
	byteOffset: grepBooleanFlag({ long: 'byte-offset', short: 'b' }),
	context: grepValueFlag({ long: 'context', short: 'C' }),
	countOnly: grepBooleanFlag({ long: 'count', short: 'c' }),
	dereferenceRecursive: grepBooleanFlag({
		long: 'dereference-recursive',
		short: 'R',
	}),
	directories: grepValueFlag({ long: 'directories' }),
	devices: grepValueFlag({ long: 'devices', short: 'D' }),
	exclude: grepValueFlag({ long: 'exclude' }),
	excludeDir: grepValueFlag({ long: 'exclude-dir' }),
	file: grepValueFlag({ long: 'file', short: 'f' }),
	filesWithMatches: grepBooleanFlag({
		long: 'files-with-matches',
		short: 'l',
	}),
	filesWithoutMatch: grepBooleanFlag({
		long: 'files-without-match',
		short: 'L',
	}),
	help: grepBooleanFlag({ long: 'help' }),
	ignoreCase: grepBooleanFlag({ long: 'ignore-case', short: 'i' }),
	include: grepValueFlag({ long: 'include' }),
	invertMatch: grepBooleanFlag({ long: 'invert-match', short: 'v' }),
	lineNumber: grepBooleanFlag({ long: 'line-number', short: 'n' }),
	lineRegexp: grepBooleanFlag({ long: 'line-regexp', short: 'x' }),
	maxCount: grepValueFlag({ long: 'max-count', short: 'm' }),
	modeBasic: grepBooleanFlag({ long: 'basic-regexp', short: 'G' }),
	modeExtended: grepBooleanFlag({ long: 'extended-regexp', short: 'E' }),
	modeFixed: grepBooleanFlag({ long: 'fixed-strings', short: 'F' }),
	modePerl: grepBooleanFlag({ long: 'perl-regexp', short: 'P' }),
	noFilename: grepBooleanFlag({ long: 'no-filename', short: 'h' }),
	noMessages: grepBooleanFlag({ long: 'no-messages', short: 's' }),
	nullData: grepBooleanFlag({ long: 'null-data', short: 'z' }),
	onlyMatching: grepBooleanFlag({ long: 'only-matching', short: 'o' }),
	pattern: grepValueFlag({ long: 'regexp', short: 'e' }),
	quiet: grepBooleanFlag({ long: 'quiet', short: 'q' }),
	recursive: grepBooleanFlag({ long: 'recursive', short: 'r' }),
	silent: grepBooleanFlag({ long: 'silent' }),
	textMode: grepBooleanFlag({ long: 'text', short: 'a' }),
	version: grepBooleanFlag({ long: 'version' }),
	withFilename: grepBooleanFlag({ long: 'with-filename', short: 'H' }),
	wordRegexp: grepBooleanFlag({ long: 'word-regexp', short: 'w' }),
};

const parseGrepWords = createWordParser<ExpandedWord>(
	GREP_FLAG_DEFS,
	expandedWordToString
);

/**
 * Compile a grep command from SimpleCommandIR to StepIR.
 */
export function compileGrep(cmd: SimpleCommandIR): StepIR {
	return {
		cmd: 'grep',
		args: parseGrepArgs(cmd.args),
	} as const;
}

export function parseGrepArgs(argv: ExpandedWord[]): GrepArgsIR {
	const parsed = parseGrepWords(argv, {
		errorPolicy: 'diagnostic',
		unknownFlagPolicy: 'diagnostic',
	});
	const options = createDefaultOptions();
	const diagnostics = parsed.diagnostics.map(mapParseDiagnostic);

	applyBooleanOptions(parsed, options);
	applyModeOption(parsed, options);
	applyFilenameMode(parsed, options);
	applyFileListingMode(parsed, options);
	applyBinaryFileOption(parsed, argv, options);
	applyDirectoriesOption(parsed, argv, options);
	applyMaxCountOption(parsed, argv, options, diagnostics);
	applyContextOptions(parsed, argv, options, diagnostics);

	options.excludeFiles = collectStringValues(parsed, argv, 'exclude');
	options.excludeDir = collectStringValues(parsed, argv, 'excludeDir');
	options.includeFiles = collectStringValues(parsed, argv, 'include');

	const explicitPatterns = collectExpandedValues(parsed, argv, 'pattern');
	const patternFiles = collectExpandedValues(parsed, argv, 'file');
	const positionalOperands = collectPositionalOperands(
		parsed,
		argv,
		diagnostics
	);
	const fileOperands = assignImplicitPattern(
		explicitPatterns,
		patternFiles,
		positionalOperands
	);
	const noPatternsYet =
		explicitPatterns.length === 0 && patternFiles.length === 0;

	return {
		diagnostics,
		explicitPatterns,
		fileOperands,
		noPatternsYet,
		options,
		patternFiles,
		usageError: diagnostics.length > 0,
	};
}

function grepBooleanFlag(options: { short?: string; long?: string }): FlagDef {
	return {
		long: options.long,
		short: options.short,
		takesValue: false,
	};
}

function grepValueFlag(options: { short?: string; long?: string }): FlagDef {
	return {
		allowFlagLikeValue: true,
		ambiguousShortValuePolicy: 'value',
		long: options.long,
		multiple: true,
		short: options.short,
		takesValue: true,
	};
}

function createDefaultOptions(): GrepOptionsIR {
	return {
		...DEFAULT_OPTIONS,
		excludeDir: [],
		excludeFiles: [],
		includeFiles: [],
	};
}

function applyBooleanOptions(
	parsed: ParsedGrepWords,
	options: GrepOptionsIR
): void {
	options.byteOffset = hasFlag(parsed, 'byteOffset');
	options.countOnly = hasFlag(parsed, 'countOnly');
	options.help = hasFlag(parsed, 'help');
	options.ignoreCase = hasFlag(parsed, 'ignoreCase');
	options.invertMatch = hasFlag(parsed, 'invertMatch');
	options.lineNumber = hasFlag(parsed, 'lineNumber');
	options.lineRegexp = hasFlag(parsed, 'lineRegexp');
	options.noMessages = hasFlag(parsed, 'noMessages');
	options.nullData = hasFlag(parsed, 'nullData');
	options.onlyMatching = hasFlag(parsed, 'onlyMatching');
	options.quiet = hasFlag(parsed, 'quiet') || hasFlag(parsed, 'silent');
	options.recursive =
		hasFlag(parsed, 'recursive') || hasFlag(parsed, 'dereferenceRecursive');
	options.textMode = hasFlag(parsed, 'textMode');
	options.version = hasFlag(parsed, 'version');
	options.wordRegexp = hasFlag(parsed, 'wordRegexp');
}

function applyModeOption(
	parsed: ParsedGrepWords,
	options: GrepOptionsIR
): void {
	const mode = pickLatestByOrder(parsed, [
		{ canonical: 'modeBasic', value: 'bre' },
		{ canonical: 'modeExtended', value: 'ere' },
		{ canonical: 'modeFixed', value: 'fixed' },
		{ canonical: 'modePerl', value: 'pcre' },
	] as const);
	if (mode !== undefined) {
		options.mode = mode;
	}
}

function applyFilenameMode(
	parsed: ParsedGrepWords,
	options: GrepOptionsIR
): void {
	const mode = pickLatestByOrder(parsed, [
		{ canonical: 'withFilename', value: 'always' },
		{ canonical: 'noFilename', value: 'never' },
	] as const);
	if (mode !== undefined) {
		options.filenameMode = mode;
	}
}

function applyFileListingMode(
	parsed: ParsedGrepWords,
	options: GrepOptionsIR
): void {
	const mode = pickLatestByOrder(parsed, [
		{ canonical: 'filesWithMatches', value: 'with' },
		{ canonical: 'filesWithoutMatch', value: 'without' },
	] as const);
	if (mode === 'with') {
		options.listFilesWithMatches = true;
		options.listFilesWithoutMatch = false;
	}
	if (mode === 'without') {
		options.listFilesWithoutMatch = true;
		options.listFilesWithMatches = false;
	}
}

function applyBinaryFileOption(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	options: GrepOptionsIR
): void {
	for (const occurrence of getValueOccurrences(parsed, argv, 'binaryFile')) {
		options.binaryWithoutMatch = occurrence.value === 'without-match';
	}
}

function applyDirectoriesOption(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	options: GrepOptionsIR
): void {
	for (const occurrence of getValueOccurrences(parsed, argv, 'directories')) {
		options.directories = occurrence.value === 'skip' ? 'skip' : 'read';
	}
}

function applyMaxCountOption(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	options: GrepOptionsIR,
	diagnostics: GrepDiagnosticIR[]
): void {
	for (const occurrence of getValueOccurrences(parsed, argv, 'maxCount')) {
		const parsedValue = parseNumericOption(occurrence.value);
		if (parsedValue === null) {
			diagnostics.push(
				makeDiagnostic(
					'invalid-value',
					occurrence.token,
					occurrence.tokenIndex,
					makeInvalidNumericValueMessage('maxCount', occurrence.token)
				)
			);
			continue;
		}
		options.maxCount = parsedValue;
	}
}

function applyContextOptions(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	options: GrepOptionsIR,
	diagnostics: GrepDiagnosticIR[]
): void {
	const assignments: ContextAssignment[] = [];
	assignments.push(
		...collectFlagContextAssignments(parsed, argv, diagnostics)
	);

	const endOfOptionsIndex = findEndOfOptionsIndex(argv);
	for (const positionalIndex of parsed.positionalIndices) {
		const word = argv[positionalIndex];
		if (!word || positionalIndex >= endOfOptionsIndex) {
			continue;
		}
		const token = expandedWordToString(word);
		if (!CONTEXT_SHORTHAND_REGEX.test(token)) {
			continue;
		}
		const parsedValue = parseNumericOption(token.slice(1));
		if (parsedValue === null) {
			diagnostics.push(
				makeDiagnostic(
					'invalid-value',
					token,
					positionalIndex,
					`Invalid numeric option value in "${token}".`
				)
			);
			continue;
		}
		assignments.push({
			kind: 'both',
			tokenIndex: positionalIndex,
			value: parsedValue,
		});
	}

	assignments.sort((a, b) => a.tokenIndex - b.tokenIndex);
	for (const assignment of assignments) {
		if (assignment.kind === 'after') {
			options.afterContext = assignment.value;
			continue;
		}
		if (assignment.kind === 'before') {
			options.beforeContext = assignment.value;
			continue;
		}
		options.beforeContext = assignment.value;
		options.afterContext = assignment.value;
	}
}

function collectFlagContextAssignments(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	diagnostics: GrepDiagnosticIR[]
): ContextAssignment[] {
	const assignments: ContextAssignment[] = [];
	const contextKinds = [
		['afterContext', 'after'],
		['beforeContext', 'before'],
		['context', 'both'],
	] as const;

	for (const [canonical, kind] of contextKinds) {
		for (const occurrence of getValueOccurrences(parsed, argv, canonical)) {
			const parsedValue = parseNumericOption(occurrence.value);
			if (parsedValue === null) {
				diagnostics.push(
					makeDiagnostic(
						'invalid-value',
						occurrence.token,
						occurrence.tokenIndex,
						makeInvalidNumericValueMessage(
							canonical,
							occurrence.token
						)
					)
				);
				continue;
			}
			assignments.push({
				kind,
				tokenIndex: occurrence.tokenIndex,
				value: parsedValue,
			});
		}
	}

	return assignments;
}

function collectPositionalOperands(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	diagnostics: GrepDiagnosticIR[]
): ExpandedWord[] {
	const endOfOptionsIndex = findEndOfOptionsIndex(argv);
	const positionalOperands: ExpandedWord[] = [];
	for (const positionalIndex of parsed.positionalIndices) {
		const word = argv[positionalIndex];
		if (!word) {
			continue;
		}
		if (positionalIndex < endOfOptionsIndex) {
			const token = expandedWordToString(word);
			if (CONTEXT_SHORTHAND_REGEX.test(token)) {
				continue;
			}
			if (token.startsWith('-') && token !== '-') {
				if (
					isKnownDiagnosticToken(diagnostics, token, positionalIndex)
				) {
					continue;
				}
				diagnostics.push(
					makeDiagnostic(
						'unknown-option',
						token,
						positionalIndex,
						`Unknown grep option: ${token}`
					)
				);
				continue;
			}
		}
		positionalOperands.push(word);
	}
	return positionalOperands;
}

function assignImplicitPattern(
	explicitPatterns: ExpandedWord[],
	patternFiles: ExpandedWord[],
	positionalOperands: ExpandedWord[]
): ExpandedWord[] {
	const fileOperands: ExpandedWord[] = [];
	let implicitPatternAssigned = false;
	for (const operand of positionalOperands) {
		if (
			!implicitPatternAssigned &&
			explicitPatterns.length === 0 &&
			patternFiles.length === 0
		) {
			explicitPatterns.push(operand);
			implicitPatternAssigned = true;
			continue;
		}
		fileOperands.push(operand);
	}
	return fileOperands;
}

function collectStringValues(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	canonical: string
): string[] {
	return getValueOccurrences(parsed, argv, canonical).map(
		(occurrence) => occurrence.value
	);
}

function collectExpandedValues(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	canonical: string
): ExpandedWord[] {
	const values: ExpandedWord[] = [];
	for (const occurrence of getValueOccurrences(parsed, argv, canonical)) {
		if (occurrence.source === 'arg') {
			const word = argv[occurrence.valueIndex];
			values.push(word ?? literal(occurrence.value));
			continue;
		}
		values.push(literal(occurrence.value));
	}
	return values;
}

function getValueOccurrences(
	parsed: ParsedGrepWords,
	argv: readonly ExpandedWord[],
	canonical: string
): ValueFlagOccurrence[] {
	const values = normalizeValueList(parsed.flags[canonical]);
	const valueIndices = parsed.consumedValueIndices[canonical] ?? [];
	const valueSources = parsed.consumedValueSources[canonical] ?? [];
	const orders = parsed.flagOccurrenceOrder[canonical] ?? [];
	const count = Math.min(
		values.length,
		valueIndices.length,
		valueSources.length,
		orders.length
	);
	const occurrences: ValueFlagOccurrence[] = [];
	for (let index = 0; index < count; index += 1) {
		const value = values[index];
		const valueIndex = valueIndices[index];
		const source = valueSources[index];
		const order = orders[index];
		if (
			value === undefined ||
			valueIndex === undefined ||
			source === undefined ||
			order === undefined
		) {
			continue;
		}
		const tokenIndex = source === 'arg' ? valueIndex - 1 : valueIndex;
		const tokenWord = argv[tokenIndex];
		let token = canonical;
		if (tokenWord !== undefined) {
			token = expandedWordToString(tokenWord);
		} else if (source === 'inline') {
			token = value;
		}
		occurrences.push({
			order,
			source,
			token,
			tokenIndex,
			value,
			valueIndex,
		});
	}
	occurrences.sort((a, b) => a.order - b.order);
	return occurrences;
}

function normalizeValueList(
	value: boolean | string | string[] | undefined
): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value;
	}
	return [];
}

function hasFlag(parsed: ParsedGrepWords, canonical: string): boolean {
	const occurrences = parsed.flagOccurrenceOrder[canonical];
	return occurrences !== undefined && occurrences.length > 0;
}

function pickLatestByOrder<T>(
	parsed: ParsedGrepWords,
	entries: readonly { canonical: string; value: T }[]
): T | undefined {
	let selected: T | undefined;
	let selectedOrder = -1;

	for (const entry of entries) {
		const order = parsed.flagOccurrenceOrder[entry.canonical]?.at(-1);
		if (order === undefined || order < selectedOrder) {
			continue;
		}
		selectedOrder = order;
		selected = entry.value;
	}

	return selected;
}

function findEndOfOptionsIndex(argv: readonly ExpandedWord[]): number {
	for (const [index, word] of argv.entries()) {
		if (expandedWordToString(word) === '--') {
			return index;
		}
	}
	return Number.POSITIVE_INFINITY;
}

function mapParseDiagnostic(diagnostic: ParseDiagnostic): GrepDiagnosticIR {
	if (
		diagnostic.code === 'unknown-flag' ||
		diagnostic.message.startsWith(UNKNOWN_FLAG_PREFIX)
	) {
		return makeDiagnostic(
			'unknown-option',
			diagnostic.token,
			diagnostic.tokenIndex,
			`Unknown grep option: ${diagnostic.token}`
		);
	}

	if (diagnostic.message.includes('requires a value')) {
		return makeDiagnostic(
			'missing-value',
			diagnostic.token,
			diagnostic.tokenIndex,
			`Option ${diagnostic.token} requires a value.`
		);
	}

	return makeDiagnostic(
		'unknown-option',
		diagnostic.token,
		diagnostic.tokenIndex,
		diagnostic.message
	);
}

function isKnownDiagnosticToken(
	diagnostics: GrepDiagnosticIR[],
	token: string,
	tokenIndex: number
): boolean {
	return diagnostics.some(
		(diagnostic) =>
			diagnostic.location.token === token &&
			diagnostic.location.tokenIndex === tokenIndex
	);
}

function parseNumericOption(value: string | null): number | null {
	if (value === null || value === '') {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

function makeInvalidNumericValueMessage(
	canonical: 'afterContext' | 'beforeContext' | 'context' | 'maxCount',
	token: string
): string {
	if (token.startsWith('--')) {
		return `Invalid numeric value for option ${splitLongOption(token)}.`;
	}

	switch (canonical) {
		case 'afterContext':
			return 'Invalid value for -A. Expected a non-negative integer.';
		case 'beforeContext':
			return 'Invalid value for -B. Expected a non-negative integer.';
		case 'context':
			return 'Invalid value for -C. Expected a non-negative integer.';
		case 'maxCount':
			return 'Invalid value for -m. Expected a non-negative integer.';
		default:
			return 'Invalid numeric value.';
	}
}

function splitLongOption(token: string): string {
	const equalsIndex = token.indexOf('=');
	if (equalsIndex === -1) {
		return token;
	}
	return token.slice(0, equalsIndex);
}

function makeDiagnostic(
	code: GrepDiagnosticCode,
	token: string,
	tokenIndex: number,
	message: string
): GrepDiagnosticIR {
	return createCommandDiagnostic('grep', code, message, {
		token,
		tokenIndex,
	});
}
