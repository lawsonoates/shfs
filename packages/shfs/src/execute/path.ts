import {
	compile,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordHasGlob,
	expandedWordParts,
	parse,
} from '@shfs/compiler';
import picomatch from 'picomatch';
import type { BuiltinContext } from '../builtin/types';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';

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

function formatRecord(record: ShellRecord): string {
	switch (record.kind) {
		case 'line':
			return record.text;
		case 'file':
			return record.path;
		case 'json':
			return JSON.stringify(record.value);
		default:
			throw new Error('Unknown record kind');
	}
}

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

async function evaluateCommandSubstitution(
	command: string,
	fs: FS,
	context: BuiltinContext
): Promise<string> {
	const parsed = parse(command);
	const nestedIR = compile(parsed);
	const executeModule = await import('./execute');
	const result = executeModule.execute(nestedIR, fs, context);
	const outputs = await collectOutputRecords(result);
	return outputs.join('\n');
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

async function listFilesystemEntries(fs: FS): Promise<FsEntry[]> {
	return await walkFilesystemEntries(fs);
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

export async function walkFilesystemEntries(
	fs: FS,
	rootDir = ROOT_DIRECTORY
): Promise<FsEntry[]> {
	const normalizedRoot = normalizeAbsolutePath(rootDir);
	const rootStat = await fs.stat(normalizedRoot);
	if (!rootStat.isDirectory) {
		throw new Error(`Not a directory: ${normalizedRoot}`);
	}

	const entries: FsEntry[] = [];
	const pendingDirectories: string[] = [normalizedRoot];

	while (pendingDirectories.length > 0) {
		const currentDirectory = pendingDirectories.pop();
		if (!currentDirectory) {
			continue;
		}

		const children = await readDirectoryPaths(fs, currentDirectory);
		for (const childPath of children) {
			const stat = await fs.stat(childPath);
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

async function expandGlobPattern(
	pattern: string,
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	const directoryOnly = pattern.endsWith(ROOT_DIRECTORY);
	const isAbsolutePattern = pattern.startsWith(ROOT_DIRECTORY);
	const matcher = picomatch(pattern, { bash: true, dot: false });
	const entries = await listFilesystemEntries(fs);
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
}

export async function evaluateExpandedPathWords(
	command: string,
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	const resolvedWords: string[] = [];
	for (const word of words) {
		const values = await evaluateExpandedPathWord(
			command,
			word,
			fs,
			context
		);
		resolvedWords.push(...values);
	}
	return resolvedWords;
}

export async function evaluateExpandedPathWord(
	command: string,
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	if (!expandedWordHasGlob(word)) {
		return [await evaluateExpandedWord(word, fs, context)];
	}

	const patternSegments: string[] = [];
	for (const part of expandedWordParts(word)) {
		patternSegments.push(await evaluateExpandedWordPart(part, fs, context));
	}

	const pattern = patternSegments.join('');
	const matches = await expandGlobPattern(pattern, fs, context);
	if (matches.length === 0) {
		throw new Error(`${command}: ${NO_GLOB_MATCH_MESSAGE}: ${pattern}`);
	}
	return matches;
}

export async function evaluateExpandedWords(
	words: ExpandedWord[],
	fs: FS,
	context: BuiltinContext
): Promise<string[]> {
	const resolvedWords: string[] = [];
	for (const word of words) {
		resolvedWords.push(await evaluateExpandedWord(word, fs, context));
	}
	return resolvedWords;
}

export async function evaluateExpandedWord(
	word: ExpandedWord,
	fs: FS,
	context: BuiltinContext
): Promise<string> {
	const segments: string[] = [];
	for (const part of expandedWordParts(word)) {
		segments.push(await evaluateExpandedWordPart(part, fs, context));
	}
	return segments.join('');
}

async function evaluateExpandedWordPart(
	part: ExpandedWordPart,
	fs: FS,
	context: BuiltinContext
): Promise<string> {
	switch (part.kind) {
		case 'literal':
			return expandVariables(part.value, context);
		case 'glob':
			return expandVariables(part.pattern, context);
		case 'commandSub': {
			const commandText = expandVariables(part.command, context);
			return await evaluateCommandSubstitution(commandText, fs, context);
		}
		default: {
			const _exhaustive: never = part;
			throw new Error(
				`Unknown word kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}
