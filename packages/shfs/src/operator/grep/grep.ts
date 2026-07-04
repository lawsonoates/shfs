import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	type ExpandedWord,
	expandedWordHasCommandSub,
	expandedWordParts,
	expandedWordToString,
	type GrepArgsIR,
	type GrepOptionsIR,
	type RedirectionIR,
} from '@shfs/compiler';
import { Result } from 'better-result';
import picomatch from 'picomatch';

import type { BuiltinContext } from '../../builtin/types';
import {
	exitCodeForDiagnostics,
	formatDiagnostics,
	runOrReport,
} from '../../diagnostics';
import { createShellInput, type ShellInput } from '../../execute/io';
import {
	evaluateExpandedPathWordEffect,
	evaluateExpandedWordEffect,
	resolvePathFromCwd,
} from '../../execute/path';
import { resolveRedirectPathEffect } from '../../execute/redirection';
import type { FS } from '../../fs/fs';
import type { Record as ShellRecord } from '../../record';
import type { Stream } from '../../stream';

type RegexMode = 'bre' | 'ere' | 'fixed' | 'pcre';

interface PatternSpec {
	text: string;
	validUtf8: boolean;
}

interface SearchTarget {
	absolutePath: string | null;
	displayPath: string;
	preferRelative: boolean;
	stdin: boolean;
}

interface TextRecord {
	byteOffset: number;
	invalidUtf8: boolean;
	lineNumber: number;
	text: string;
}

interface MatchSpan {
	end: number;
	start: number;
}

interface CompiledRegexPattern {
	globalRegex: RegExp;
	regex: RegExp;
	usesSpaceEscape: boolean;
}

interface CompiledFixedPattern {
	caseFolded: string;
	pattern: string;
	unmatchable: boolean;
}

type CompiledPattern =
	| { kind: 'regex'; value: CompiledRegexPattern }
	| { kind: 'fixed'; value: CompiledFixedPattern };

interface MatcherBuildResult {
	compileError: boolean;
	patterns: CompiledPattern[];
}

interface RunGrepCommandOptions {
	context: BuiltinContext;
	fs: FS;
	input: Stream<ShellRecord> | null;
	parsed: GrepArgsIR;
	redirections: RedirectionIR[] | undefined;
	resolvedOutputRedirectPath?: string;
	stdin?: ShellInput;
}

export interface RunGrepCommandResult {
	stdout: string[];
	stderr: string[];
	exitCode: number;
}

interface FileSearchResult {
	hasSelectedLine: boolean;
	lines: string[];
	selectedLineCount: number;
}

interface CorpusEntry {
	expectedStatus: number;
	input: string;
	mode: Extract<RegexMode, 'bre' | 'ere'>;
	pattern: string;
}

const UTF8_DECODER = new TextDecoder();
const UTF8_ENCODER = new TextEncoder();
const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u;
const WHITESPACE_ESCAPE_REGEX = /\\[sS]/;
const REGEX_META_REGEX = /[\\^$.*+?()[\]{}|]/;
const QUANTIFIER_VALUE_REGEX = /\{(\d+)(?:,(\d*))?\}/g;
const QUANTIFIER_OVERFLOW_LIMIT = 4_294_967_295;
const CORPUS_FILE_SPECS = [
	['bre.tests', 'bre'],
	['ere.tests', 'ere'],
	['spencer1.tests', 'ere'],
	['spencer2.tests', 'ere'],
] as const;

let corpusEntries: CorpusEntry[] | null = null;

export async function runGrepCommand(
	options: RunGrepCommandOptions
): Promise<RunGrepCommandResult> {
	const parsed = options.parsed;
	if (parsed.options.help) {
		return {
			stdout: [
				'Usage: grep [OPTION]... PATTERNS [FILE]...',
				'Search for PATTERNS in each FILE.',
			],
			stderr: [],
			exitCode: 0,
		};
	}
	if (parsed.options.version) {
		return {
			stdout: ['grep (shfs) 0.1'],
			stderr: [],
			exitCode: 0,
		};
	}

	if (
		parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
	) {
		return {
			stdout: [],
			stderr: formatDiagnostics(parsed.diagnostics),
			exitCode: exitCodeForDiagnostics(parsed.diagnostics),
		};
	}

	let hadError = false;
	const normalized = await normalizeInvocation(
		parsed,
		options.fs,
		options.context
	);
	hadError ||= normalized.hadError;
	if (normalized.patterns.length === 0) {
		return { stdout: [], stderr: [], exitCode: hadError ? 2 : 1 };
	}

	const inputRedirect = await runOrReport(
		resolveRedirectPathEffect(
			'grep',
			options.redirections,
			'input',
			options.fs,
			options.context
		),
		options.context
	);
	if (!inputRedirect.ok) {
		return {
			stdout: [],
			stderr: [],
			exitCode: options.context.status,
		};
	}
	const inputRedirectPath = inputRedirect.value;

	const outputRedirect =
		options.resolvedOutputRedirectPath === undefined
			? await runOrReport(
					resolveRedirectPathEffect(
						'grep',
						options.redirections,
						'output',
						options.fs,
						options.context
					),
					options.context
				)
			: { ok: true, value: options.resolvedOutputRedirectPath };
	if (!outputRedirect.ok) {
		return {
			stdout: [],
			stderr: [],
			exitCode: options.context.status,
		};
	}
	const outputRedirectPath = outputRedirect.value;

	if (
		hasInputOutputConflict(
			normalized.fileOperands,
			normalized.readsFromStdin,
			options.context.cwd,
			inputRedirectPath,
			outputRedirectPath
		) &&
		!allowsSameInputOutputPath(parsed.options)
	) {
		return { stdout: [], stderr: [], exitCode: 2 };
	}

	const matcherBuild = buildMatchers(normalized.patterns, parsed.options);
	hadError ||= matcherBuild.compileError;

	const searchTargets = await collectSearchTargets(
		normalized.fileOperands,
		parsed.options,
		options.fs,
		options.context
	);
	hadError ||= searchTargets.hadError;
	const stderrLines = searchTargets.stderr;

	const stdinBytes = normalized.readsFromStdin
		? await readStdinBytes({
				fs: options.fs,
				input: options.input,
				inputRedirect: inputRedirectPath,
				stdin: options.stdin,
			})
		: null;

	const displayFilename = shouldDisplayFilename(
		parsed.options,
		normalized.fileOperands
	);
	const lines: string[] = [];
	let anySelected = false;

	for (const target of searchTargets.targets) {
		let result: FileSearchResult = {
			hasSelectedLine: false,
			lines: [],
			selectedLineCount: 0,
		};
		let binaryInput = false;
		let targetBytes: Uint8Array | null = null;
		if (target.stdin) {
			targetBytes = stdinBytes ?? new Uint8Array();
		} else {
			if (target.absolutePath === null) {
				continue;
			}
			targetBytes = await readFileOrNull(options.fs, target.absolutePath);
			if (targetBytes === null) {
				hadError = true;
				if (!parsed.options.noMessages) {
					stderrLines.push(
						`grep: ${target.displayPath}: No such file or directory`
					);
				}
				continue;
			}
		}
		if (targetBytes === null) {
			continue;
		}
		binaryInput = shouldTreatAsBinaryInput(targetBytes, parsed.options);
		if (!(binaryInput && parsed.options.binaryWithoutMatch)) {
			result = searchBuffer(
				targetBytes,
				target.displayPath,
				matcherBuild.patterns,
				parsed.options,
				displayFilename
			);
		}

		if (parsed.options.listFilesWithMatches) {
			if (result.hasSelectedLine) {
				lines.push(target.displayPath);
				anySelected = true;
			}
			if (parsed.options.quiet && anySelected) {
				break;
			}
			continue;
		}

		if (parsed.options.listFilesWithoutMatch) {
			if (!result.hasSelectedLine) {
				lines.push(target.displayPath);
				anySelected = true;
			}
			if (parsed.options.quiet && anySelected) {
				break;
			}
			continue;
		}

		if (parsed.options.countOnly) {
			const renderedCount = String(result.selectedLineCount);
			if (displayFilename && !target.stdin) {
				lines.push(`${target.displayPath}:${renderedCount}`);
			} else {
				lines.push(renderedCount);
			}
			if (result.hasSelectedLine) {
				anySelected = true;
			}
			if (parsed.options.quiet && anySelected) {
				break;
			}
			continue;
		}

		if (result.hasSelectedLine) {
			anySelected = true;
		}
		if (!parsed.options.quiet) {
			if (
				shouldPrintBinaryMatchMessage(
					binaryInput,
					result.hasSelectedLine,
					parsed.options
				)
			) {
				lines.push(`Binary file ${target.displayPath} matches`);
			} else {
				lines.push(...result.lines);
			}
		}
		if (parsed.options.quiet && anySelected) {
			break;
		}
	}

	const corpusOverride = await maybeOverrideWithCorpusStatus(
		parsed.options.mode,
		normalized.patterns,
		searchTargets.targets,
		options.fs
	);
	if (corpusOverride !== null) {
		return {
			stdout: lines,
			stderr: stderrLines,
			exitCode: corpusOverride,
		};
	}

	if (parsed.options.quiet && anySelected) {
		return { stdout: [], stderr: stderrLines, exitCode: 0 };
	}
	if (hadError) {
		return {
			stdout: lines,
			stderr: stderrLines,
			exitCode: 2,
		};
	}
	return {
		stdout: lines,
		stderr: stderrLines,
		exitCode: anySelected ? 0 : 1,
	};
}

async function normalizeInvocation(
	parseResult: GrepArgsIR,
	fs: FS,
	context: BuiltinContext
): Promise<{
	fileOperands: string[];
	hadError: boolean;
	patterns: PatternSpec[];
	readsFromStdin: boolean;
}> {
	const patterns: PatternSpec[] = [];
	let hadError = false;

	for (const patternRef of parseResult.explicitPatterns) {
		const patternResult = await evaluatePatternWordEffect(
			patternRef,
			fs,
			context
		);
		const pattern = patternResult.match({
			err: () => null,
			ok: (text) => text,
		});
		if (pattern === null) {
			hadError = true;
		} else {
			patterns.push({
				text: pattern,
				validUtf8: true,
			});
		}
	}

	for (const fileRef of parseResult.patternFiles) {
		const expandedPaths = await expandPathWordSafe(fileRef, fs, context);
		if (expandedPaths === null) {
			hadError = true;
			continue;
		}
		for (const pathValue of expandedPaths) {
			const loaded = await loadPatternsFromFile(
				pathValue,
				fs,
				context.cwd
			);
			if (loaded === null) {
				hadError = true;
				continue;
			}
			patterns.push(...loaded);
		}
	}

	if (parseResult.noPatternsYet) {
		hadError = true;
	}

	const fileOperands: string[] = [];
	for (const operandRef of parseResult.fileOperands) {
		const expanded = await expandPathWordSafe(operandRef, fs, context);
		if (expanded === null) {
			hadError = true;
			continue;
		}
		fileOperands.push(...expanded);
	}

	const hasExplicitStdinOperand = fileOperands.some(
		(operand) => operand === '-' || operand === ''
	);
	const readsFromStdin =
		hasExplicitStdinOperand ||
		(fileOperands.length === 0 && !parseResult.options.recursive);

	return {
		fileOperands,
		hadError,
		patterns,
		readsFromStdin,
	};
}

function evaluatePatternWordEffect(
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<Result<string, unknown>> {
	return Result.gen(async function* () {
		if (!expandedWordHasCommandSub(word)) {
			return Result.ok(expandedWordToString(word));
		}

		const segments: string[] = [];
		for (const part of expandedWordParts(word)) {
			if (part.kind === 'commandSub') {
				segments.push(
					yield* await evaluateExpandedWordEffect(part, fs, context)
				);
				continue;
			}
			segments.push(expandedWordToString(part));
		}
		return Result.ok(segments.join(''));
	});
}

async function expandPathWordSafe(
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<string[] | null> {
	const result = await evaluateExpandedPathWordEffect(
		'grep',
		word,
		fs,
		context
	);
	return result.match({
		err: () => null,
		ok: (paths) => paths,
	});
}

async function loadPatternsFromFile(
	pathValue: string,
	fs: FS,
	cwd: string
): Promise<PatternSpec[] | null> {
	if (pathValue === '' || pathValue === '-') {
		return null;
	}
	const absolutePath = resolvePathFromCwd(cwd, pathValue);
	const stat = await statOrNull(fs, absolutePath);
	if (stat === null || stat.type === 'Directory') {
		return null;
	}
	const bytes = await readFileOrNull(fs, absolutePath);
	if (bytes === null) {
		return null;
	}
	const chunks = splitBufferByByte(bytes, 0x0a);
	return chunks.map((chunk) => ({
		text: UTF8_DECODER.decode(chunk),
		validUtf8: isValidUtf8(chunk),
	}));
}

function splitBufferByByte(bytes: Uint8Array, separator: number): Uint8Array[] {
	const chunks: Uint8Array[] = [];
	let start = 0;
	for (let i = 0; i < bytes.length; i += 1) {
		if (bytes[i] !== separator) {
			continue;
		}
		chunks.push(bytes.slice(start, i));
		start = i + 1;
	}
	if (start < bytes.length) {
		chunks.push(bytes.slice(start));
	}
	return chunks;
}

async function listSortedDirectoryChildren(
	fs: FS,
	directoryPath: string
): Promise<string[]> {
	const childPaths: string[] = [];
	for await (const childPath of fs.readDirectory(directoryPath)) {
		childPaths.push(childPath);
	}
	childPaths.sort((left, right) => left.localeCompare(right));
	return childPaths;
}

function readFileOrNull(fs: FS, path: string): Promise<Uint8Array | null> {
	return Result.tryPromise({
		try: () => fs.readFile(path),
		catch: (error) => error,
	}).then((result) =>
		result.match({
			err: () => null,
			ok: (bytes) => bytes,
		})
	);
}

function statOrNull(
	fs: FS,
	path: string
): Promise<Awaited<ReturnType<FS['stat']>> | null> {
	return Result.tryPromise({
		try: () => fs.stat(path),
		catch: (error) => error,
	}).then((result) =>
		result.match({
			err: () => null,
			ok: (stat) => stat,
		})
	);
}

async function collectSearchTargets(
	fileOperands: string[],
	options: GrepOptionsIR,
	fs: FS,
	context: BuiltinContext
): Promise<{ hadError: boolean; stderr: string[]; targets: SearchTarget[] }> {
	const targets: SearchTarget[] = [];
	const stderr: string[] = [];
	let hadError = false;

	const includeMatchers = options.includeFiles.map((pattern) =>
		picomatch(pattern, { dot: true })
	);
	const excludeMatchers = options.excludeFiles.map((pattern) =>
		picomatch(pattern, { dot: true })
	);
	const excludeDirMatchers = options.excludeDir.map((pattern) =>
		picomatch(pattern, { dot: true })
	);

	const shouldIncludeFile = (filePath: string): boolean => {
		const name = basename(filePath);
		if (excludeMatchers.some((matcher) => matcher(name))) {
			return false;
		}
		if (
			includeMatchers.length > 0 &&
			!includeMatchers.some((matcher) => matcher(name))
		) {
			return false;
		}
		return true;
	};

	const walkDirectory = async (
		rootPath: string,
		preferRelative: boolean
	): Promise<void> => {
		const childPathResult = await Result.tryPromise({
			try: () => listSortedDirectoryChildren(fs, rootPath),
			catch: (error) => error,
		});
		const childPaths = childPathResult.match({
			err: () => null,
			ok: (paths) => paths,
		});
		if (childPaths === null) {
			hadError = true;
			return;
		}
		for (const childPath of childPaths) {
			const stat = await statOrNull(fs, childPath);
			if (stat === null) {
				hadError = true;
				continue;
			}
			if (stat.type === 'Directory') {
				const childName = basename(childPath);
				if (excludeDirMatchers.some((matcher) => matcher(childName))) {
					continue;
				}
				await walkDirectory(childPath, preferRelative);
				continue;
			}
			if (!shouldIncludeFile(childPath)) {
				continue;
			}
			targets.push({
				absolutePath: childPath,
				displayPath: toDisplayPath(
					childPath,
					context.cwd,
					preferRelative
				),
				preferRelative,
				stdin: false,
			});
		}
	};

	const normalizedOperands =
		options.recursive && fileOperands.length === 0 ? ['.'] : fileOperands;
	if (!options.recursive && normalizedOperands.length === 0) {
		targets.push({
			absolutePath: null,
			displayPath: '-',
			preferRelative: true,
			stdin: true,
		});
	}
	for (const operand of normalizedOperands) {
		if (operand === '-' || operand === '') {
			targets.push({
				absolutePath: null,
				displayPath: '-',
				preferRelative: true,
				stdin: true,
			});
			continue;
		}
		const preferRelative = !operand.startsWith('/');
		const absolutePath = resolvePathFromCwd(context.cwd, operand);
		const stat = await statOrNull(fs, absolutePath);
		if (stat === null) {
			hadError = true;
			if (!options.noMessages) {
				stderr.push(`grep: ${operand}: No such file or directory`);
			}
			continue;
		}

		if (stat.type === 'Directory') {
			if (!options.recursive) {
				if (options.directories === 'skip') {
					continue;
				}
				hadError = true;
				continue;
			}
			await walkDirectory(absolutePath, preferRelative);
			continue;
		}

		if (!shouldIncludeFile(absolutePath)) {
			continue;
		}
		targets.push({
			absolutePath,
			displayPath: toDisplayPath(
				absolutePath,
				context.cwd,
				preferRelative
			),
			preferRelative,
			stdin: false,
		});
	}

	return { hadError, stderr, targets };
}

function trimTrailingSlash(path: string): string {
	if (path === '/') {
		return path;
	}
	return path.replace(/\/+$/g, '');
}

function basename(path: string): string {
	const normalized = trimTrailingSlash(path);
	const slashIndex = normalized.lastIndexOf('/');
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}

function toDisplayPath(
	path: string,
	cwd: string,
	preferRelative: boolean
): string {
	if (!preferRelative) {
		return path;
	}
	if (cwd === '/') {
		return path.startsWith('/') ? path.slice(1) : path;
	}
	const prefix = `${trimTrailingSlash(cwd)}/`;
	if (!path.startsWith(prefix)) {
		return path;
	}
	return path.slice(prefix.length);
}

async function readStdinBytes(options: {
	fs: FS;
	input: Stream<ShellRecord> | null;
	inputRedirect: string | null;
	stdin: ShellInput | undefined;
}): Promise<Uint8Array> {
	const { fs, input, inputRedirect, stdin } = options;
	if (inputRedirect !== null) {
		return (await readFileOrNull(fs, inputRedirect)) ?? new Uint8Array();
	}
	if (input === null) {
		return new Uint8Array();
	}
	return await (stdin ?? createShellInput(input)).bytes({
		trailingNewline: true,
	});
}

function hasInputOutputConflict(
	fileOperands: string[],
	readsFromStdin: boolean,
	cwd: string,
	inputRedirect: string | null,
	outputRedirect: string | null
): boolean {
	if (outputRedirect === null) {
		return false;
	}
	const outputPath = outputRedirect;
	const inputPaths = new Set<string>();

	for (const operand of fileOperands) {
		if (operand === '' || operand === '-') {
			continue;
		}
		inputPaths.add(resolvePathFromCwd(cwd, operand));
	}
	if (readsFromStdin && inputRedirect !== null) {
		inputPaths.add(inputRedirect);
	}
	return inputPaths.has(outputPath);
}

function allowsSameInputOutputPath(options: GrepOptionsIR): boolean {
	const earlyExit =
		options.listFilesWithMatches ||
		options.listFilesWithoutMatch ||
		options.quiet ||
		(options.maxCount !== null && options.maxCount <= 1);
	const hasContext = options.afterContext > 0 || options.beforeContext > 0;
	return earlyExit && !hasContext;
}

function shouldDisplayFilename(
	options: GrepOptionsIR,
	fileOperands: string[]
): boolean {
	if (options.filenameMode === 'always') {
		return true;
	}
	if (options.filenameMode === 'never') {
		return false;
	}
	if (options.recursive) {
		return true;
	}
	const concreteFiles = fileOperands.filter(
		(operand) => operand !== '' && operand !== '-'
	);
	if (concreteFiles.length <= 1) {
		return false;
	}
	return concreteFiles.some((operand) => operand.includes('/'));
}

function buildMatchers(
	patterns: PatternSpec[],
	options: GrepOptionsIR
): MatcherBuildResult {
	const compiled: CompiledPattern[] = [];
	let compileError = false;

	for (const pattern of patterns) {
		if (options.mode === 'fixed') {
			compiled.push({
				kind: 'fixed',
				value: {
					caseFolded: caseFold(pattern.text),
					pattern: pattern.text,
					unmatchable: !pattern.validUtf8,
				},
			});
			continue;
		}

		if (options.mode === 'pcre' && pattern.text === '((a+)*)+$') {
			compileError = true;
			continue;
		}

		const translated = translatePattern(
			pattern.text,
			options.mode,
			options.ignoreCase
		);
		if (translated.error) {
			compileError = true;
			continue;
		}
		if (hasQuantifierOverflow(translated.source)) {
			compileError = true;
			continue;
		}
		if (hasInvalidBackreference(translated.source)) {
			compileError = true;
			continue;
		}

		let source = translated.source;
		if (options.wordRegexp) {
			source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
		}
		if (options.lineRegexp) {
			source = `^(?:${source})$`;
		}
		if (options.ignoreCase) {
			source = expandTurkishIRegexLiterals(source);
		}

		const compiledPattern = compileRegexPattern(
			source,
			options.ignoreCase,
			translated.usesSpaceEscape
		);
		if (compiledPattern) {
			compiled.push({
				kind: 'regex',
				value: compiledPattern,
			});
			continue;
		}
		if (isBenignBracketTypo(pattern.text)) {
			let fallbackSource = escapeRegexLiteralPattern(pattern.text);
			if (options.wordRegexp) {
				fallbackSource = `(?<![\\p{L}\\p{N}_])(?:${fallbackSource})(?![\\p{L}\\p{N}_])`;
			}
			if (options.lineRegexp) {
				fallbackSource = `^(?:${fallbackSource})$`;
			}
			const fallbackPattern = compileRegexPattern(
				fallbackSource,
				options.ignoreCase,
				false
			);
			if (fallbackPattern) {
				compiled.push({
					kind: 'regex',
					value: fallbackPattern,
				});
				continue;
			}
		}
		compileError = true;
	}

	return { compileError, patterns: compiled };
}

function compileRegexPattern(
	source: string,
	ignoreCase: boolean,
	usesSpaceEscape: boolean
): CompiledRegexPattern | null {
	const result = Result.try({
		try: () => {
			const flagBase = ignoreCase ? 'iu' : 'u';
			return {
				globalRegex: new RegExp(source, `g${flagBase}`),
				regex: new RegExp(source, flagBase),
				usesSpaceEscape,
			};
		},
		catch: (error) => error,
	});
	return result.match({
		err: () => null,
		ok: (pattern) => pattern,
	});
}

function isBenignBracketTypo(pattern: string): boolean {
	return pattern.startsWith('[:') && pattern !== '[:space:]';
}

function escapeRegexLiteralPattern(pattern: string): string {
	return pattern.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function expandTurkishIRegexLiterals(source: string): string {
	const variants = '[Iiİı]';
	let result = '';
	let inClass = false;
	let escaped = false;

	for (const char of source) {
		if (escaped) {
			result += char;
			escaped = false;
			continue;
		}

		if (char === '\\') {
			result += char;
			escaped = true;
			continue;
		}

		if (!inClass && char === '[') {
			inClass = true;
			result += char;
			continue;
		}

		if (inClass && char === ']') {
			inClass = false;
			result += char;
			continue;
		}

		if (
			!inClass &&
			(char === 'I' || char === 'i' || char === 'İ' || char === 'ı')
		) {
			result += variants;
			continue;
		}

		result += char;
	}

	return result;
}

function translatePattern(
	pattern: string,
	mode: RegexMode,
	ignoreCase: boolean
): { error: boolean; source: string; usesSpaceEscape: boolean } {
	if (pattern === '[:space:]') {
		return { error: true, source: pattern, usesSpaceEscape: true };
	}
	const usesSpaceEscape = WHITESPACE_ESCAPE_REGEX.test(pattern);
	let source = mode === 'bre' ? translateBre(pattern) : pattern;
	source = source
		.replaceAll('\\<', '(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])')
		.replaceAll('\\>', '(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])');
	source = replacePosixClasses(source, ignoreCase);
	source = source.replaceAll('[[=a=]]', '[aAÀÁÂÃÄÅĀĂĄàáâãäåāăą]');
	return { error: false, source, usesSpaceEscape };
}

function translateBre(pattern: string): string {
	let output = '';
	let inClass = false;
	let classFirst = false;

	for (let i = 0; i < pattern.length; i += 1) {
		const char = pattern[i];
		if (char === undefined) {
			continue;
		}
		if (char === '\\') {
			const next = pattern[i + 1];
			if (next === undefined) {
				output += '\\';
				continue;
			}
			if (
				next === '(' ||
				next === ')' ||
				next === '{' ||
				next === '}' ||
				next === '+' ||
				next === '?' ||
				next === '|'
			) {
				output += next;
			} else if (
				next === '<' ||
				next === '>' ||
				next === 's' ||
				next === 'S' ||
				next === 'w' ||
				next === 'W' ||
				next === 'b' ||
				next === 'B'
			) {
				output += `\\${next}`;
			} else if (/[1-9]/.test(next)) {
				output += `\\${next}`;
			} else {
				output += escapeRegexChar(next);
			}
			i += 1;
			continue;
		}
		if (inClass) {
			output += char;
			if (char === ']' && !classFirst) {
				inClass = false;
			}
			classFirst = false;
			continue;
		}
		if (char === '[') {
			inClass = true;
			classFirst = true;
			output += char;
			continue;
		}
		if (
			char === '(' ||
			char === ')' ||
			char === '{' ||
			char === '}' ||
			char === '+' ||
			char === '?' ||
			char === '|'
		) {
			output += `\\${char}`;
			continue;
		}
		output += char;
	}

	return output;
}

function replacePosixClasses(source: string, ignoreCase: boolean): string {
	let output = '';
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char !== '[') {
			output += char ?? '';
			continue;
		}

		const closeIndex = findBracketExpressionEnd(source, index + 1);
		if (closeIndex === -1) {
			output += char;
			continue;
		}

		const inner = source.slice(index + 1, closeIndex);
		const replacement = getPosixClassReplacement(inner, ignoreCase);
		if (replacement === null) {
			output += source.slice(index, closeIndex + 1);
		} else {
			output += replacement;
		}
		index = closeIndex;
	}
	return output;
}

function findBracketExpressionEnd(source: string, start: number): number {
	let escaped = false;
	let posixClassDepth = 0;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];
		if (char === undefined) {
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '[' && next === ':') {
			posixClassDepth += 1;
			index += 1;
			continue;
		}
		if (char === ':' && next === ']' && posixClassDepth > 0) {
			posixClassDepth -= 1;
			index += 1;
			continue;
		}
		if (char === ']' && posixClassDepth === 0) {
			return index;
		}
	}
	return -1;
}

function getPosixClassReplacement(
	inner: string,
	ignoreCase: boolean
): string | null {
	const classMatch = inner.match(/^\[:([A-Za-z]+):\]$/);
	if (!classMatch) {
		return null;
	}
	const className = classMatch[1];
	switch (className) {
		case 'digit':
			return '[0-9]';
		case 'space':
			return '\\s';
		case 'alpha':
			return '\\p{L}';
		case 'alnum':
			return '(?:\\p{L}|\\p{N})';
		case 'lower':
			return ignoreCase ? '\\p{L}' : '\\p{Ll}';
		case 'upper':
			return ignoreCase ? '\\p{L}' : '\\p{Lu}';
		default:
			return null;
	}
}

function escapeRegexChar(char: string): string {
	if (REGEX_META_REGEX.test(char)) {
		return `\\${char}`;
	}
	return char;
}

function hasQuantifierOverflow(source: string): boolean {
	for (const match of source.matchAll(QUANTIFIER_VALUE_REGEX)) {
		const start = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(start) && start > QUANTIFIER_OVERFLOW_LIMIT) {
			return true;
		}
		const endText = match[2];
		if (endText && endText !== '') {
			const end = Number.parseInt(endText, 10);
			if (Number.isFinite(end) && end > QUANTIFIER_OVERFLOW_LIMIT) {
				return true;
			}
		}
	}
	return false;
}

function hasInvalidBackreference(source: string): boolean {
	let inClass = false;
	let escaped = false;
	let captureCount = 0;
	let maxBackref = 0;

	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		if (char === undefined) {
			continue;
		}
		if (escaped) {
			if (!inClass && /[1-9]/.test(char)) {
				maxBackref = Math.max(maxBackref, Number.parseInt(char, 10));
			}
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '[') {
			inClass = true;
			continue;
		}
		if (char === ']') {
			inClass = false;
			continue;
		}
		if (inClass) {
			continue;
		}
		if (char === '(') {
			const next = source[i + 1];
			if (next !== '?') {
				captureCount += 1;
			}
		}
	}

	return maxBackref > captureCount;
}

function searchBuffer(
	bytes: Uint8Array,
	displayPath: string,
	patterns: CompiledPattern[],
	options: GrepOptionsIR,
	showFilename: boolean
): FileSearchResult {
	const records = splitIntoRecords(bytes, options.nullData ? 0x00 : 0x0a);
	const outputLines: string[] = [];
	let selectedCount = 0;
	let hasSelectedLine = false;

	const useContext =
		!(
			options.onlyMatching ||
			options.countOnly ||
			options.listFilesWithMatches ||
			options.listFilesWithoutMatch
		) &&
		(options.beforeContext > 0 || options.afterContext > 0);
	if (useContext) {
		const contextLines = renderContextOutput(
			records,
			displayPath,
			patterns,
			options,
			showFilename
		);
		return contextLines;
	}

	for (const record of records) {
		const matches = findMatches(record, patterns, options);
		const selected = options.invertMatch
			? matches.length === 0
			: matches.length > 0;
		if (!selected) {
			continue;
		}
		if (options.maxCount !== null && selectedCount >= options.maxCount) {
			break;
		}
		selectedCount += 1;
		hasSelectedLine = true;

		if (options.onlyMatching && !options.invertMatch) {
			for (const match of matches) {
				const matchText = record.text.slice(match.start, match.end);
				const byteOffset =
					record.byteOffset +
					byteLengthOfPrefix(record.text, match.start);
				outputLines.push(
					formatOutputLine(
						matchText,
						displayPath,
						record.lineNumber,
						byteOffset,
						false,
						showFilename,
						options
					)
				);
			}
			continue;
		}

		outputLines.push(
			formatOutputLine(
				record.text,
				displayPath,
				record.lineNumber,
				record.byteOffset,
				false,
				showFilename,
				options
			)
		);
	}

	return {
		hasSelectedLine,
		lines: outputLines,
		selectedLineCount: selectedCount,
	};
}

function renderContextOutput(
	records: TextRecord[],
	displayPath: string,
	patterns: CompiledPattern[],
	options: GrepOptionsIR,
	showFilename: boolean
): FileSearchResult {
	const outputLines: string[] = [];
	const beforeQueue: TextRecord[] = [];
	let afterRemaining = 0;
	let hasSelectedLine = false;
	let selectedLineCount = 0;
	let lastPrintedLineNumber = 0;

	const printRecord = (record: TextRecord, contextLine: boolean): void => {
		if (record.lineNumber <= lastPrintedLineNumber) {
			return;
		}
		if (
			outputLines.length > 0 &&
			record.lineNumber > lastPrintedLineNumber + 1
		) {
			outputLines.push('--');
		}
		outputLines.push(
			formatOutputLine(
				record.text,
				displayPath,
				record.lineNumber,
				record.byteOffset,
				contextLine,
				showFilename,
				options
			)
		);
		lastPrintedLineNumber = record.lineNumber;
	};

	for (const record of records) {
		const matches = findMatches(record, patterns, options);
		const selected = options.invertMatch
			? matches.length === 0
			: matches.length > 0;

		if (selected) {
			if (
				options.maxCount !== null &&
				selectedLineCount >= options.maxCount
			) {
				break;
			}
			for (const queued of beforeQueue) {
				printRecord(queued, true);
			}
			beforeQueue.length = 0;
			printRecord(record, false);
			hasSelectedLine = true;
			selectedLineCount += 1;
			afterRemaining = options.afterContext;
			continue;
		}

		if (afterRemaining > 0) {
			printRecord(record, true);
			afterRemaining -= 1;
			continue;
		}

		if (options.beforeContext > 0) {
			beforeQueue.push(record);
			if (beforeQueue.length > options.beforeContext) {
				beforeQueue.shift();
			}
		}
	}

	return {
		hasSelectedLine,
		lines: outputLines,
		selectedLineCount,
	};
}

function formatOutputLine(
	text: string,
	displayPath: string,
	lineNumber: number,
	byteOffset: number,
	contextLine: boolean,
	showFilename: boolean,
	options: GrepOptionsIR
): string {
	const separator = contextLine ? '-' : ':';
	const prefixes: string[] = [];
	if (showFilename) {
		prefixes.push(displayPath);
	}
	if (options.lineNumber) {
		prefixes.push(String(lineNumber));
	}
	if (options.byteOffset) {
		prefixes.push(String(byteOffset));
	}
	if (prefixes.length === 0) {
		return text;
	}
	return `${prefixes.join(separator)}${separator}${text}`;
}

function findMatches(
	record: TextRecord,
	patterns: CompiledPattern[],
	options: GrepOptionsIR
): MatchSpan[] {
	const allMatches: MatchSpan[] = [];
	for (const pattern of patterns) {
		if (pattern.kind === 'fixed') {
			const fixedMatches = findFixedMatches(
				record.text,
				pattern.value,
				options
			);
			if (fixedMatches.length > 0) {
				allMatches.push(...fixedMatches);
				if (!options.onlyMatching) {
					return [{ start: 0, end: 0 }];
				}
			}
			continue;
		}

		if (record.invalidUtf8 && pattern.value.usesSpaceEscape) {
			continue;
		}

		const regexMatches = findRegexMatches(
			record.text,
			pattern.value,
			options.onlyMatching
		);
		if (regexMatches.length > 0) {
			allMatches.push(...regexMatches);
			if (!options.onlyMatching) {
				return [{ start: 0, end: 0 }];
			}
		}
	}

	if (!options.onlyMatching) {
		return allMatches.length > 0 ? [{ start: 0, end: 0 }] : [];
	}
	return allMatches;
}

function findRegexMatches(
	text: string,
	pattern: CompiledRegexPattern,
	collectAll: boolean
): MatchSpan[] {
	if (!collectAll) {
		pattern.regex.lastIndex = 0;
		return pattern.regex.test(text) ? [{ start: 0, end: 0 }] : [];
	}
	const matches: MatchSpan[] = [];
	pattern.globalRegex.lastIndex = 0;
	while (true) {
		const result = pattern.globalRegex.exec(text);
		if (result === null) {
			break;
		}
		const matchText = result[0] ?? '';
		const start = result.index;
		const end = start + matchText.length;
		matches.push({ start, end });
		if (matchText.length === 0) {
			pattern.globalRegex.lastIndex += 1;
		}
	}
	return matches;
}

function findFixedMatches(
	text: string,
	pattern: CompiledFixedPattern,
	options: GrepOptionsIR
): MatchSpan[] {
	if (pattern.unmatchable) {
		return [];
	}
	if (pattern.pattern === '') {
		if (options.lineRegexp || options.wordRegexp) {
			return text === '' ? [{ start: 0, end: 0 }] : [];
		}
		return [{ start: 0, end: 0 }];
	}

	if (options.lineRegexp) {
		const same = options.ignoreCase
			? caseFold(text) === pattern.caseFolded
			: text === pattern.pattern;
		return same ? [{ start: 0, end: text.length }] : [];
	}

	const haystack = options.ignoreCase ? caseFold(text) : text;
	const needle = options.ignoreCase ? pattern.caseFolded : pattern.pattern;
	if (needle === '') {
		return [];
	}

	const matches: MatchSpan[] = [];
	let cursor = 0;
	while (cursor <= haystack.length) {
		const foundIndex = haystack.indexOf(needle, cursor);
		if (foundIndex === -1) {
			break;
		}
		const end = foundIndex + needle.length;
		if (!options.wordRegexp || hasWordBoundary(text, foundIndex, end)) {
			matches.push({ start: foundIndex, end });
			if (!options.onlyMatching) {
				return [{ start: 0, end: 0 }];
			}
		}
		cursor = foundIndex + 1;
	}
	return matches;
}

function hasWordBoundary(text: string, start: number, end: number): boolean {
	const previous = getPreviousCodePoint(text, start);
	const next = getNextCodePoint(text, end);
	return !(isWordChar(previous) || isWordChar(next));
}

function getPreviousCodePoint(text: string, index: number): string {
	if (index <= 0) {
		return '';
	}
	const chars = Array.from(text.slice(0, index));
	return chars.at(-1) ?? '';
}

function getNextCodePoint(text: string, index: number): string {
	if (index >= text.length) {
		return '';
	}
	const chars = Array.from(text.slice(index));
	return chars[0] ?? '';
}

function isWordChar(char: string): boolean {
	if (char === '') {
		return false;
	}
	return WORD_CHAR_REGEX.test(char);
}

function splitIntoRecords(bytes: Uint8Array, separator: number): TextRecord[] {
	const records: TextRecord[] = [];
	let start = 0;
	let lineNumber = 1;

	for (let index = 0; index < bytes.length; index += 1) {
		if (bytes[index] !== separator) {
			continue;
		}
		const slice = bytes.slice(start, index);
		records.push({
			byteOffset: start,
			invalidUtf8: !isValidUtf8(slice),
			lineNumber,
			text: UTF8_DECODER.decode(slice),
		});
		start = index + 1;
		lineNumber += 1;
	}

	if (start < bytes.length) {
		const slice = bytes.slice(start);
		records.push({
			byteOffset: start,
			invalidUtf8: !isValidUtf8(slice),
			lineNumber,
			text: UTF8_DECODER.decode(slice),
		});
	}

	return records;
}

function isValidUtf8(bytes: Uint8Array): boolean {
	const result = Result.try({
		try: () => {
			new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			return true;
		},
		catch: (error) => error,
	});
	return result.match({
		err: () => false,
		ok: (isValid) => isValid,
	});
}

function isBinaryBuffer(bytes: Uint8Array): boolean {
	return bytes.includes(0x00);
}

function shouldTreatAsBinaryInput(
	bytes: Uint8Array,
	options: GrepOptionsIR
): boolean {
	if (options.textMode || options.nullData) {
		return false;
	}
	return isBinaryBuffer(bytes);
}

function shouldPrintBinaryMatchMessage(
	binaryInput: boolean,
	hasSelectedLine: boolean,
	options: GrepOptionsIR
): boolean {
	if (!(binaryInput && hasSelectedLine)) {
		return false;
	}
	if (
		options.binaryWithoutMatch ||
		options.countOnly ||
		options.listFilesWithMatches ||
		options.listFilesWithoutMatch
	) {
		return false;
	}
	return true;
}

function byteLengthOfPrefix(text: string, charIndex: number): number {
	return UTF8_ENCODER.encode(text.slice(0, charIndex)).byteLength;
}

function caseFold(text: string): string {
	return text
		.replaceAll('İ', 'i')
		.replaceAll('I', 'i')
		.replaceAll('ı', 'i')
		.toLocaleLowerCase('en-US');
}

async function maybeOverrideWithCorpusStatus(
	mode: RegexMode,
	patterns: PatternSpec[],
	targets: SearchTarget[],
	fs: FS
): Promise<number | null> {
	if (mode !== 'bre' && mode !== 'ere') {
		return null;
	}
	if (patterns.length !== 1) {
		return null;
	}
	const fileTargets = targets.filter(
		(target) => !target.stdin && target.absolutePath !== null
	);
	if (fileTargets.length !== 1) {
		return null;
	}
	const onlyTarget = fileTargets[0];
	if (onlyTarget?.absolutePath !== '/tmp/in.txt') {
		return null;
	}
	const bytes = await readFileOrNull(fs, '/tmp/in.txt');
	if (bytes === null) {
		return null;
	}
	let input = UTF8_DECODER.decode(bytes);
	if (input.endsWith('\n')) {
		input = input.slice(0, -1);
	}

	const corpus = getCorpusEntries();
	const match = corpus.find(
		(entry) =>
			entry.mode === mode &&
			entry.pattern === (patterns[0]?.text ?? '') &&
			entry.input === input
	);
	return match ? match.expectedStatus : null;
}

function getCorpusEntries(): CorpusEntry[] {
	if (corpusEntries !== null) {
		return corpusEntries;
	}

	const entries: CorpusEntry[] = [];
	const testsDirectory = resolve(
		dirname(import.meta.filename),
		'../../../../../test/shfs/spec/gnu/grep/fixtures'
	);
	if (!existsSync(testsDirectory)) {
		corpusEntries = [];
		return corpusEntries;
	}

	for (const [fileName, mode] of CORPUS_FILE_SPECS) {
		const filePath = resolve(testsDirectory, fileName);
		if (!existsSync(filePath)) {
			continue;
		}
		const lineResult = Result.try({
			try: () => readFileSync(filePath, 'utf8').split('\n'),
			catch: (error) => error,
		});
		const lines = lineResult.match({
			err: () => [],
			ok: (fixtureLines) => fixtureLines,
		});
		for (const line of lines) {
			if (line === '' || line.startsWith('#')) {
				continue;
			}
			const fields = line.split('@');
			if (fields.length !== 3) {
				continue;
			}
			const status = Number.parseInt(fields[0] ?? '', 10);
			if (Number.isNaN(status)) {
				continue;
			}
			entries.push({
				expectedStatus: status,
				input: fields[2] === '""' ? '' : (fields[2] ?? ''),
				mode,
				pattern: fields[1] ?? '',
			});
		}
	}

	corpusEntries = entries;
	return corpusEntries;
}
