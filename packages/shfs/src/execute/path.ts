import {
	compileEffect,
	createExpansionDiagnostic,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordHasGlob,
	expandedWordParts,
	parseEffect,
} from '@shfs/compiler';

import { Effect } from 'effect';
import picomatch from 'picomatch';
import type { BuiltinContext } from '../builtin/types';
import {
	createDiagnosticError,
	type ShellErrorCause,
	ShellRuntimeError,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { formatRecord, type Record as ShellRecord } from '../record';
import { toShellFailure } from './record-stream';

function toShellErrorCause(cause: unknown): ShellErrorCause {
	return toShellFailure(cause) as ShellErrorCause;
}

interface FsEntry {
	path: string;
	isDirectory: boolean;
}

type NestedExecuteResult =
	| { kind: 'stream'; value: AsyncIterable<ShellRecord> }
	| { kind: 'sink'; value: Promise<void> };

const MULTIPLE_SLASH_REGEX = /\/+/g;
const ROOT_DIRECTORY = '/';
const TRAILING_SLASH_REGEX = /\/+$/;
const VARIABLE_REFERENCE_REGEX = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
const NO_GLOB_MATCH_MESSAGE = 'no matches found';

async function collectOutputRecords(
	result: NestedExecuteResult
): Promise<string[]> {
	if (result.kind === 'sink') {
		await result.value;
		return [];
	}

	const outputs: string[] = [];
	for await (const record of result.value) {
		outputs.push(formatRecord(record));
	}
	return outputs;
}

function evaluateCommandSubstitutionEffect(
	command: string,
	fs: FS,
	context: BuiltinContext
): Effect.Effect<string, ShellErrorCause> {
	return Effect.gen(function* () {
		const parsed = yield* parseEffect(command).pipe(
			Effect.mapError(toShellErrorCause)
		);
		const nestedIR = yield* compileEffect(parsed).pipe(
			Effect.mapError(toShellErrorCause)
		);
		const executeModule = yield* Effect.promise(() => import('./execute'));
		const result = executeModule.execute(nestedIR, fs, context);
		const outputs = yield* Effect.promise(() =>
			collectOutputRecords(result)
		);
		return outputs.join('\n');
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
	for await (const childPath of fs.readdir(directoryPath)) {
		children.push(childPath);
	}
	children.sort((left, right) => left.localeCompare(right));
	return children;
}

function walkFilesystemEntriesEffect(
	fs: FS,
	rootDir = ROOT_DIRECTORY
): Effect.Effect<FsEntry[], ShellErrorCause> {
	return Effect.gen(function* () {
		const normalizedRoot = normalizeAbsolutePath(rootDir);
		const rootStat = yield* Effect.tryPromise({
			try: () => fs.stat(normalizedRoot),
			catch: toShellErrorCause,
		});
		if (!rootStat.isDirectory) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: `Not a directory: ${normalizedRoot}`,
			});
		}

		const entries: FsEntry[] = [];
		const pendingDirectories: string[] = [normalizedRoot];

		while (pendingDirectories.length > 0) {
			const currentDirectory = pendingDirectories.pop();
			if (!currentDirectory) {
				continue;
			}

			const children = yield* Effect.tryPromise({
				try: () => readDirectoryPaths(fs, currentDirectory),
				catch: toShellErrorCause,
			});
			for (const childPath of children) {
				const stat = yield* Effect.tryPromise({
					try: () => fs.stat(childPath),
					catch: toShellErrorCause,
				});
				entries.push({
					path: childPath,
					isDirectory: stat.isDirectory,
				});
				if (stat.isDirectory) {
					pendingDirectories.push(childPath);
				}
			}
		}

		entries.sort((left, right) => left.path.localeCompare(right.path));
		return entries;
	});
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
): Effect.Effect<string[], ShellErrorCause> {
	return Effect.gen(function* () {
		const directoryOnly = pattern.endsWith(ROOT_DIRECTORY);
		const isAbsolutePattern = pattern.startsWith(ROOT_DIRECTORY);
		const matcher = picomatch(pattern, { bash: true, dot: false });
		const entries = yield* walkFilesystemEntriesEffect(fs);
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
		return matches;
	});
}

function expectSingleExpandedPathEffect(
	command: string,
	expectation: string,
	values: string[],
	allowEmpty = false
): Effect.Effect<string, ShellErrorCause> {
	return Effect.gen(function* () {
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
		return resolvedValue;
	});
}

export async function evaluateExpandedPathWords(
	command: string,
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	return Effect.runPromise(
		evaluateExpandedPathWordsEffect(command, words, fs, context)
	);
}

export const evaluateExpandedPathWordsEffect: (
	command: string,
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
) => Effect.Effect<string[], ShellErrorCause> = Effect.fn(
	'Path.evaluateExpandedPathWords'
)(function* (command, words, fs, context) {
	const resolvedWords: string[] = [];
	for (const word of words) {
		const values = yield* evaluateExpandedPathWordEffect(
			command,
			word,
			fs,
			context
		);
		resolvedWords.push(...values);
	}
	return resolvedWords;
});

export const evaluateExpandedPathWordEffect: (
	command: string,
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
) => Effect.Effect<string[], ShellErrorCause> = Effect.fn(
	'Path.evaluateExpandedPathWord'
)(function* (command, word, fs, context) {
	if (!expandedWordHasGlob(word)) {
		return [yield* evaluateExpandedWordEffect(word, fs, context)];
	}

	const patternSegments: string[] = [];
	for (const part of expandedWordParts(word)) {
		patternSegments.push(
			yield* evaluateExpandedWordPartEffect(part, fs, context)
		);
	}

	const pattern = patternSegments.join('');
	const matches = yield* expandGlobPatternEffect(pattern, fs, context);
	if (matches.length === 0) {
		return yield* createDiagnosticError(
			createExpansionDiagnostic(
				command,
				'no-match',
				`${NO_GLOB_MATCH_MESSAGE}: ${pattern}`
			)
		);
	}
	return matches;
});

export const evaluateExpandedSinglePathEffect: (
	command: string,
	expectation: string,
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext,
	options?: { allowEmpty?: boolean }
) => Effect.Effect<string, ShellErrorCause> = Effect.fn(
	'Path.evaluateExpandedSinglePath'
)(function* (command, expectation, word, fs, context, options) {
	return yield* expectSingleExpandedPathEffect(
		command,
		expectation,
		yield* evaluateExpandedPathWordEffect(command, word, fs, context),
		options?.allowEmpty ?? false
	);
});

export async function evaluateExpandedWords(
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	return Effect.runPromise(evaluateExpandedWordsEffect(words, fs, context));
}

export const evaluateExpandedWordsEffect: (
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
) => Effect.Effect<string[], ShellErrorCause> = Effect.fn(
	'Path.evaluateExpandedWords'
)(function* (words, fs, context) {
	const resolvedWords: string[] = [];
	for (const word of words) {
		resolvedWords.push(
			yield* evaluateExpandedWordEffect(word, fs, context)
		);
	}
	return resolvedWords;
});

export async function evaluateExpandedWord(
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<string> {
	return Effect.runPromise(evaluateExpandedWordEffect(word, fs, context));
}

export const evaluateExpandedWordEffect: (
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
) => Effect.Effect<string, ShellErrorCause> = Effect.fn(
	'Path.evaluateExpandedWord'
)(function* (word, fs, context) {
	const segments: string[] = [];
	for (const part of expandedWordParts(word)) {
		segments.push(yield* evaluateExpandedWordPartEffect(part, fs, context));
	}
	return segments.join('');
});

function evaluateExpandedWordPartEffect(
	part: ExpandedWordPart,
	fs: FS,
	context: BuiltinContext
): Effect.Effect<string, ShellErrorCause> {
	return Effect.gen(function* () {
		switch (part.kind) {
			case 'literal':
				return expandVariables(part.value, context);
			case 'glob':
				return expandVariables(part.pattern, context);
			case 'commandSub': {
				const commandText = expandVariables(part.command, context);
				return yield* evaluateCommandSubstitutionEffect(
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
