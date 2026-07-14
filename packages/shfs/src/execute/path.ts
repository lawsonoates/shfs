import {
	compile,
	createExpansionDiagnostic,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordParts,
	parse,
} from '@shfs/compiler';

import { Result } from 'better-result';
import picomatch from 'picomatch';
import type { BuiltinContext } from '../builtin/types';
import {
	createDiagnosticError,
	type ShellErrorCause,
	type ShellResult,
	ShellRuntimeError,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { formatRecord, type Record as ShellRecord } from '../record';
import { collectRecordStream, toShellFailure } from './record-stream';
import { lookupVariable, selectByIndex } from './variables';

function toShellErrorCause(cause: unknown): ShellErrorCause {
	return toShellFailure(cause) as ShellErrorCause;
}

interface FsEntry {
	path: string;
	isDirectory: boolean;
}

interface PendingDirectory {
	ancestorRealPaths: Set<string>;
	path: string;
}

const MULTIPLE_SLASH_REGEX = /\/+/g;
const ROOT_DIRECTORY = '/';
const TRAILING_SLASH_REGEX = /\/+$/;
const NO_GLOB_MATCH_MESSAGE = 'no matches found';

function separate(records: readonly ShellRecord[]): string[] {
	const lines: string[] = [];
	let inferred = '';
	const flush = () => {
		if (inferred === '') {
			return;
		}
		const split = inferred.split('\n');
		if (split.at(-1) === '') {
			split.pop();
		}
		lines.push(...split);
		inferred = '';
	};
	for (const record of records) {
		if (record.kind === 'line' && record.separation === 'explicit') {
			flush();
			lines.push(record.text);
			continue;
		}
		inferred += formatRecord(record);
		if (record.kind !== 'line' || record.terminated !== false) {
			inferred += '\n';
		}
	}
	flush();
	return lines;
}

/**
 * Execute a command substitution and return its output lines.
 * A final newline terminates a field without creating another synthetic one.
 */
function evaluateCommandSubstitutionEffect(
	command: string,
	fs: FS,
	context: BuiltinContext
): ShellResult<string[], ShellErrorCause> {
	return Result.gen(async function* () {
		const parsed = yield* Result.mapError(
			Result.try({ try: () => parse(command), catch: toShellErrorCause }),
			toShellErrorCause
		);
		const nestedIR = yield* Result.mapError(
			Result.try({
				try: () => compile(parsed),
				catch: toShellErrorCause,
			}),
			toShellErrorCause
		);
		const executeModule = await import('./execute');
		const records = yield* Result.mapError(
			await collectRecordStream(
				executeModule.execute(nestedIR, fs, context)
			),
			toShellErrorCause
		);
		return Result.ok(separate(records));
	});
}

export function normalizeAbsolutePath(path: string): string {
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
	const normalizedPath = `${ROOT_DIRECTORY}${normalizedSegments.join(ROOT_DIRECTORY)}`;
	return normalizedPath === '' ? ROOT_DIRECTORY : normalizedPath;
}

export function normalizeCwd(cwd: string): string {
	if (cwd === '') {
		return ROOT_DIRECTORY;
	}
	const normalized = normalizeAbsolutePath(cwd);
	const trimmed = normalized.replace(TRAILING_SLASH_REGEX, '');
	return trimmed === '' ? ROOT_DIRECTORY : trimmed;
}

export function resolvePathFromCwd(cwd: string, path: string): string {
	if (path === '') {
		return cwd;
	}
	if (path.startsWith(ROOT_DIRECTORY)) {
		return normalizeAbsolutePath(path);
	}
	return normalizeAbsolutePath(`${cwd}/${path}`);
}

export function resolvePathsFromCwd(cwd: string, paths: string[]): string[] {
	return paths.map((path) => resolvePathFromCwd(cwd, path));
}

async function readDirectoryPaths(
	fs: FS,
	directoryPath: string
): Promise<string[]> {
	const children: string[] = [];
	for await (const childPath of fs.readDirectory(directoryPath)) {
		children.push(childPath);
	}
	children.sort((left, right) => left.localeCompare(right));
	return children;
}

function walkFilesystemEntriesEffect(
	fs: FS,
	rootDir = ROOT_DIRECTORY
): ShellResult<FsEntry[], ShellErrorCause> {
	return Result.gen(async function* () {
		const normalizedRoot = normalizeAbsolutePath(rootDir);
		const rootStat = yield* await Result.tryPromise({
			try: () => fs.stat(normalizedRoot),
			catch: toShellErrorCause,
		});
		if (rootStat.type !== 'Directory') {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `Not a directory: ${normalizedRoot}`,
			});
		}

		const entries: FsEntry[] = [];
		const rootRealPath = yield* await Result.tryPromise({
			try: () => fs.realPath(normalizedRoot),
			catch: toShellErrorCause,
		});
		const pendingDirectories: PendingDirectory[] = [
			{
				ancestorRealPaths: new Set([rootRealPath]),
				path: normalizedRoot,
			},
		];

		while (pendingDirectories.length > 0) {
			const currentDirectory = pendingDirectories.pop();
			if (!currentDirectory) {
				continue;
			}

			const children = yield* await Result.tryPromise({
				try: () => readDirectoryPaths(fs, currentDirectory.path),
				catch: toShellErrorCause,
			});
			for (const childPath of children) {
				const logicalChildPath = appendPath(
					currentDirectory.path,
					basename(childPath)
				);
				const isDirectory = yield* await getDirectoryStatusEffect(
					fs,
					logicalChildPath
				);
				entries.push({
					path: logicalChildPath,
					isDirectory,
				});
				if (isDirectory) {
					const realChildPath = yield* await Result.tryPromise({
						try: () => fs.realPath(logicalChildPath),
						catch: toShellErrorCause,
					});
					if (currentDirectory.ancestorRealPaths.has(realChildPath)) {
						continue;
					}
					pendingDirectories.push({
						ancestorRealPaths: new Set([
							...currentDirectory.ancestorRealPaths,
							realChildPath,
						]),
						path: logicalChildPath,
					});
				}
			}
		}

		entries.sort((left, right) => left.path.localeCompare(right.path));
		return Result.ok(entries);
	});
}

function getDirectoryStatusEffect(
	fs: FS,
	path: string
): ShellResult<boolean, ShellErrorCause> {
	return Result.gen(async function* () {
		const statResult = await Result.tryPromise({
			try: () => fs.stat(path),
			catch: toShellErrorCause,
		});
		if (Result.isOk(statResult)) {
			return Result.ok(statResult.value.type === 'Directory');
		}

		const linkResult = await Result.tryPromise({
			try: () => fs.readLink(path),
			catch: toShellErrorCause,
		});
		if (Result.isOk(linkResult)) {
			return Result.ok(false);
		}

		return Result.err(statResult.error);
	});
}

function appendPath(parentPath: string, childName: string): string {
	if (parentPath === ROOT_DIRECTORY) {
		return `${ROOT_DIRECTORY}${childName}`;
	}
	return `${parentPath}${ROOT_DIRECTORY}${childName}`;
}

function basename(path: string): string {
	const normalized = path.replace(TRAILING_SLASH_REGEX, '');
	const slashIndex = normalized.lastIndexOf(ROOT_DIRECTORY);
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}

function toRelativePathFromCwd(path: string, cwd: string): string | null {
	if (cwd === ROOT_DIRECTORY) {
		if (path === ROOT_DIRECTORY) {
			return null;
		}
		return path.startsWith(ROOT_DIRECTORY) ? path.slice(1) : path;
	}
	if (path === cwd) {
		return null;
	}
	const prefix = `${cwd}${ROOT_DIRECTORY}`;
	if (!path.startsWith(prefix)) {
		return null;
	}
	return path.slice(prefix.length);
}

function toGlobCandidate(
	entry: FsEntry,
	cwd: string,
	isAbsolutePattern: boolean,
	directoryOnly: boolean
): string | null {
	if (directoryOnly && !entry.isDirectory) {
		return null;
	}

	const basePath = isAbsolutePattern
		? entry.path
		: toRelativePathFromCwd(entry.path, cwd);
	if (!basePath || basePath === '') {
		return null;
	}

	if (directoryOnly) {
		return `${basePath}${ROOT_DIRECTORY}`;
	}
	return basePath;
}

function expandGlobPatternEffect(
	pattern: string,
	fs: FS,
	context: BuiltinContext
): ShellResult<string[], ShellErrorCause> {
	return Result.gen(async function* () {
		const directoryOnly = pattern.endsWith(ROOT_DIRECTORY);
		const isAbsolutePattern = pattern.startsWith(ROOT_DIRECTORY);
		const matcher = picomatch(pattern, { bash: true, dot: false });
		const entries = yield* await walkFilesystemEntriesEffect(fs);
		const matches: string[] = [];

		for (const entry of entries) {
			const candidate = toGlobCandidate(
				entry,
				context.cwd,
				isAbsolutePattern,
				directoryOnly
			);
			if (!candidate) {
				continue;
			}
			if (matcher(candidate)) {
				matches.push(candidate);
			}
		}

		matches.sort((left, right) => left.localeCompare(right));
		return Result.ok(matches);
	});
}

function expectSingleExpandedPathEffect(
	command: string,
	expectation: string,
	values: string[],
	allowEmpty = false
): ShellResult<string, ShellErrorCause> {
	return Result.gen(function* () {
		if (values.length !== 1) {
			return yield* createDiagnosticError(
				createExpansionDiagnostic(
					command,
					'invalid-path-count',
					`${expectation}, got ${values.length}`
				)
			);
		}

		const resolvedValue = values.at(0);
		if (resolvedValue === undefined) {
			return yield* createDiagnosticError(
				createExpansionDiagnostic(
					command,
					'missing-path',
					'path missing after expansion'
				)
			);
		}
		if (!allowEmpty && resolvedValue === '') {
			return yield* createDiagnosticError(
				createExpansionDiagnostic(
					command,
					'invalid-path-count',
					`${expectation}, got empty path`
				)
			);
		}
		return Result.ok(resolvedValue);
	});
}

export async function evaluateExpandedPathWords(
	command: string,
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	const result = await evaluateExpandedPathWordsEffect(
		command,
		words,
		fs,
		context
	);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const evaluateExpandedPathWordsEffect: (
	command: string,
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
) => ShellResult<string[], ShellErrorCause> = (command, words, fs, context) =>
	Result.gen(async function* () {
		const resolvedWords: string[] = [];
		for (const word of words) {
			const values = yield* await evaluateExpandedPathWordEffect(
				command,
				word,
				fs,
				context
			);
			resolvedWords.push(...values);
		}
		return Result.ok(resolvedWords);
	});

export const evaluateExpandedPathWordEffect: (
	command: string,
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
) => ShellResult<string[], ShellErrorCause> = (command, word, fs, context) =>
	expandWordToValuesEffect(word, fs, context, { command });

export const evaluateExpandedSinglePathEffect: (
	command: string,
	expectation: string,
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext,
	options?: { allowEmpty?: boolean }
) => ShellResult<string, ShellErrorCause> = (
	command,
	expectation,
	word,
	fs,
	context,
	options
) =>
	Result.gen(async function* () {
		return await expectSingleExpandedPathEffect(
			command,
			expectation,
			yield* await evaluateExpandedPathWordEffect(
				command,
				word,
				fs,
				context
			),
			options?.allowEmpty ?? false
		);
	});

export async function evaluateExpandedWords(
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	const result = await evaluateExpandedWordsEffect(words, fs, context);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const evaluateExpandedWordsEffect: (
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
) => ShellResult<string[], ShellErrorCause> = (words, fs, context) =>
	Result.gen(async function* () {
		const resolvedWords: string[] = [];
		for (const word of words) {
			resolvedWords.push(
				...(yield* await expandWordToValuesEffect(word, fs, context))
			);
		}
		return Result.ok(resolvedWords);
	});

export async function evaluateExpandedWord(
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<string> {
	const result = await evaluateExpandedWordEffect(word, fs, context);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

/**
 * Expand a word to a single string. Words that expand to multiple values
 * join with spaces (like a double-quoted fish expansion).
 */
export const evaluateExpandedWordEffect: (
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
) => ShellResult<string, ShellErrorCause> = (word, fs, context) =>
	Result.gen(async function* () {
		const values = yield* await expandWordToValuesEffect(word, fs, context);
		return Result.ok(values.join(' '));
	});

export interface ExpandWordOptions {
	/** Command name used in glob no-match diagnostics. */
	command?: string;
	/** Expand unmatched globs to an empty list instead of failing. */
	emptyGlobOk?: boolean;
}

/**
 * Expand one word into its list of argument values (fish semantics):
 *
 * - unquoted list variables and command substitutions contribute one value
 *   per element/line; quoted ones contribute a single joined value
 * - adjacent parts combine as a cartesian product; an empty list factor
 *   elides the entire word
 * - words containing glob parts expand each product as a glob pattern
 */
export const expandWordToValuesEffect: (
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext,
	options?: ExpandWordOptions
) => ShellResult<string[], ShellErrorCause> = (word, fs, context, options) =>
	Result.gen(async function* () {
		const parts = expandedWordParts(word);
		const partCandidates: string[][] = [];
		let hasGlob = false;

		for (const part of parts) {
			partCandidates.push(
				yield* await expandPartToCandidatesEffect(part, fs, context)
			);
			if (part.kind === 'glob') {
				hasGlob = true;
			}
		}

		const products = cartesianProduct(partCandidates);
		if (!hasGlob) {
			return Result.ok(products);
		}
		return await expandGlobProductsEffect(products, fs, context, options);
	});

/**
 * Combine per-part candidate lists left to right. An empty factor elides
 * the entire word.
 */
function cartesianProduct(partCandidates: readonly string[][]): string[] {
	let products: string[] = [''];
	for (const candidates of partCandidates) {
		if (candidates.length === 0) {
			return [];
		}
		const next: string[] = [];
		for (const product of products) {
			for (const candidate of candidates) {
				next.push(product + candidate);
			}
		}
		products = next;
	}
	return products;
}

function expandGlobProductsEffect(
	products: readonly string[],
	fs: FS,
	context: BuiltinContext,
	options?: ExpandWordOptions
): ShellResult<string[], ShellErrorCause> {
	return Result.gen(async function* () {
		const matches: string[] = [];
		let firstUnmatchedPattern: string | null = null;
		for (const pattern of products) {
			const globbed = yield* await expandGlobPatternEffect(
				pattern,
				fs,
				context
			);
			if (globbed.length === 0) {
				firstUnmatchedPattern ??= pattern;
				continue;
			}
			matches.push(...globbed);
		}
		// Fish semantics: when variable expansion produces several glob
		// products, one unmatched product does not fail the word as long as
		// another product matches (tests/checks/wildcard.fish).
		if (
			matches.length === 0 &&
			firstUnmatchedPattern !== null &&
			!options?.emptyGlobOk
		) {
			return yield* createDiagnosticError(
				createExpansionDiagnostic(
					options?.command ?? '<glob>',
					'no-match',
					`${NO_GLOB_MATCH_MESSAGE}: ${firstUnmatchedPattern}`
				)
			);
		}
		return Result.ok(matches);
	});
}

function expandPartToCandidatesEffect(
	part: ExpandedWordPart,
	fs: FS,
	context: BuiltinContext
): ShellResult<string[], ShellErrorCause> {
	return Result.gen(async function* () {
		switch (part.kind) {
			case 'literal':
				return Result.ok([part.value]);
			case 'glob':
				return Result.ok([part.pattern]);
			case 'variable': {
				let values = lookupVariable(context, part.name) ?? [];
				if (part.index !== null) {
					values = yield* selectByIndex(context, values, part.index);
				}
				return Result.ok(part.quoted ? [values.join(' ')] : values);
			}
			case 'commandSub': {
				let lines = yield* await evaluateCommandSubstitutionEffect(
					part.command,
					fs,
					context
				);
				if (part.index !== null && part.index !== undefined) {
					lines = yield* selectByIndex(context, lines, part.index);
				}
				return Result.ok(part.quoted ? [lines.join('\n')] : lines);
			}
			default: {
				const _exhaustive: never = part;
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `Unknown word kind: ${JSON.stringify(_exhaustive)}`,
				});
			}
		}
	});
}
