import {
	compile,
	createExpansionDiagnostic,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordHasGlob,
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
import { formatRecord } from '../record';
import { collectRecordStream, toShellFailure } from './record-stream';

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
const VARIABLE_REFERENCE_REGEX = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
const NO_GLOB_MATCH_MESSAGE = 'no matches found';

function evaluateCommandSubstitutionEffect(
	command: string,
	fs: FS,
	context: BuiltinContext
): ShellResult<string, ShellErrorCause> {
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
		return Result.ok(
			records.map((record) => formatRecord(record)).join('\n')
		);
	});
}

function resolveVariable(
	variableName: string,
	context: BuiltinContext
): string {
	if (variableName === 'status') {
		return String(context.status);
	}
	return (
		context.localVars.get(variableName) ??
		context.globalVars.get(variableName) ??
		''
	);
}

function expandVariables(input: string, context: BuiltinContext): string {
	return input.replace(VARIABLE_REFERENCE_REGEX, (_full, variableName) => {
		return resolveVariable(variableName, context);
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
	Result.gen(async function* () {
		if (!expandedWordHasGlob(word)) {
			return Result.ok([
				yield* await evaluateExpandedWordEffect(word, fs, context),
			]);
		}

		const patternSegments: string[] = [];
		for (const part of expandedWordParts(word)) {
			patternSegments.push(
				yield* await evaluateExpandedWordPartEffect(part, fs, context)
			);
		}

		const pattern = patternSegments.join('');
		const matches = yield* await expandGlobPatternEffect(
			pattern,
			fs,
			context
		);
		if (matches.length === 0) {
			return yield* createDiagnosticError(
				createExpansionDiagnostic(
					command,
					'no-match',
					`${NO_GLOB_MATCH_MESSAGE}: ${pattern}`
				)
			);
		}
		return Result.ok(matches);
	});

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
				yield* await evaluateExpandedWordEffect(word, fs, context)
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

export const evaluateExpandedWordEffect: (
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
) => ShellResult<string, ShellErrorCause> = (word, fs, context) =>
	Result.gen(async function* () {
		const segments: string[] = [];
		for (const part of expandedWordParts(word)) {
			segments.push(
				yield* await evaluateExpandedWordPartEffect(part, fs, context)
			);
		}
		return Result.ok(segments.join(''));
	});

function evaluateExpandedWordPartEffect(
	part: ExpandedWordPart,
	fs: FS,
	context: BuiltinContext
): ShellResult<string, ShellErrorCause> {
	return Result.gen(async function* () {
		switch (part.kind) {
			case 'literal':
				return Result.ok(expandVariables(part.value, context));
			case 'glob':
				return Result.ok(expandVariables(part.pattern, context));
			case 'commandSub': {
				const commandText = expandVariables(part.command, context);
				return await evaluateCommandSubstitutionEffect(
					commandText,
					fs,
					context
				);
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
