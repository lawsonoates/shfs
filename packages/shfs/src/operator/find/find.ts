import {
	createRuntimeDiagnostic,
	type FindPredicateIR,
	type FindStep,
	hasErrorDiagnostics,
} from '@shfs/compiler';
import { Result } from 'better-result';
import picomatch from 'picomatch';

import type { BuiltinContext } from '../../builtin/types';
import {
	exitCodeForDiagnostics,
	isShellDiagnosticError,
	type ShellErrorCause,
	type ShellResult,
	ShellRuntimeError,
	writeDiagnosticsToStderr,
} from '../../diagnostics';
import {
	evaluateExpandedPathWordEffect,
	evaluateExpandedWordEffect,
	resolvePathFromCwd,
} from '../../execute/path';
import type { FS } from '../../fs/fs';
import type { FileRecord, Record as ShellRecord } from '../../record';
import { appendStderrLines } from '../../stderr';
import type { Stream } from '../../stream';

type ResolvedFindPredicate =
	| {
			kind: 'name';
			matcher: (value: string) => boolean;
	  }
	| {
			kind: 'path';
			matcher: (value: string) => boolean;
	  }
	| {
			kind: 'regex';
			matcher: (value: string) => boolean;
	  }
	| {
			kind: 'constant';
			value: boolean;
	  }
	| {
			kind: 'empty';
	  }
	| {
			kind: 'type';
			types: Set<'d' | 'f'>;
	  };

interface FindTraversalState {
	hadError: boolean;
}

interface FindResolvedPath {
	absolutePath: string;
	displayPath: string;
}

interface FindEntry extends FindResolvedPath {
	depth: number;
	isDirectory: boolean;
	size: number;
}

export async function* find(
	fs: FS,
	context: BuiltinContext,
	args: FindStep['args']
): Stream<ShellRecord> {
	if (hasErrorDiagnostics(args.diagnostics)) {
		context.status = exitCodeForDiagnostics(args.diagnostics);
		writeDiagnosticsToStderr(context, args.diagnostics);
		return;
	}

	const predicateResult = await resolvePredicatesEffect(
		args.predicateBranches,
		fs,
		context
	);
	const resolvedPredicateBranches = predicateResult.match({
		err: (error) => {
			context.status = diagnosticExitCode(error);
			writeErrorToStderr(context, error);
			return null;
		},
		ok: (branches) => branches,
	});
	if (resolvedPredicateBranches === null) {
		return;
	}

	const startPathResult = await resolveStartPathsEffect(
		fs,
		context,
		args.startPaths
	);
	const startPaths = startPathResult.match({
		err: (error) => {
			context.status = diagnosticExitCode(error);
			writeErrorToStderr(context, error);
			return null;
		},
		ok: (paths) => paths,
	});
	if (startPaths === null) {
		return;
	}

	const state: FindTraversalState = {
		hadError: false,
	};
	const hasEmptyPredicate = resolvedPredicateBranches.some((branch) =>
		branch.some((predicate) => predicate.kind === 'empty')
	);

	for (const startPath of startPaths) {
		const startStat = await statOrNull(fs, startPath.absolutePath);
		if (startStat === null) {
			state.hadError = true;
			writeDiagnosticsToStderr(context, [
				createRuntimeDiagnostic(
					'find',
					'missing-path',
					'No such file or directory',
					{
						path: startPath.displayPath,
					}
				),
			]);
			continue;
		}

		yield* walkEntry(
			fs,
			context,
			{
				...startPath,
				depth: 0,
				isDirectory: startStat.type === 'Directory',
				size: startStat.size,
			},
			args,
			resolvedPredicateBranches,
			state,
			hasEmptyPredicate
		);
	}

	context.status = state.hadError ? 1 : 0;
}

async function* walkEntry(
	fs: FS,
	context: BuiltinContext,
	entry: FindEntry,
	args: FindStep['args'],
	predicateBranches: ResolvedFindPredicate[][],
	state: FindTraversalState,
	hasEmptyPredicate: boolean
): Stream<ShellRecord> {
	const shouldRecurse =
		entry.isDirectory &&
		(args.traversal.maxdepth === null ||
			entry.depth < args.traversal.maxdepth);
	const shouldReadChildren =
		shouldRecurse || (entry.isDirectory && hasEmptyPredicate);
	let childPaths: string[] | null = null;

	if (shouldReadChildren) {
		const childPathResult = await Result.tryPromise({
			try: () => readChildren(fs, entry.absolutePath),
			catch: (error) => error,
		});
		childPaths = childPathResult.match({
			err: () => null,
			ok: (paths) => paths,
		});
		if (childPaths === null) {
			state.hadError = true;
			writeDiagnosticsToStderr(context, [
				createRuntimeDiagnostic(
					'find',
					'unreadable-directory',
					'Unable to read directory',
					{
						path: entry.displayPath,
					}
				),
			]);
		}
	}

	const matches =
		entry.depth >= args.traversal.mindepth &&
		matchesPredicates(entry, predicateBranches, childPaths);

	if (!args.traversal.depth && matches) {
		yield toFileRecord(entry);
	}

	if (shouldRecurse && childPaths !== null) {
		for (const childAbsolutePath of childPaths) {
			const childStat = await statOrNull(fs, childAbsolutePath);
			if (childStat === null) {
				state.hadError = true;
				writeDiagnosticsToStderr(context, [
					createRuntimeDiagnostic(
						'find',
						'missing-path',
						'No such file or directory',
						{
							path: appendDisplayPath(
								entry.displayPath,
								basename(childAbsolutePath)
							),
						}
					),
				]);
				continue;
			}

			yield* walkEntry(
				fs,
				context,
				{
					absolutePath: childAbsolutePath,
					displayPath: appendDisplayPath(
						entry.displayPath,
						basename(childAbsolutePath)
					),
					depth: entry.depth + 1,
					isDirectory: childStat.type === 'Directory',
					size: childStat.size,
				},
				args,
				predicateBranches,
				state,
				hasEmptyPredicate
			);
		}
	}

	if (args.traversal.depth && matches) {
		yield toFileRecord(entry);
	}
}

function resolvePredicatesEffect(
	predicateBranches: FindPredicateIR[][],
	fs: FS,
	context: BuiltinContext
): ShellResult<ResolvedFindPredicate[][], ShellErrorCause> {
	return Result.gen(async function* () {
		const resolved: ResolvedFindPredicate[][] = [];
		for (const branch of predicateBranches) {
			const resolvedBranch: ResolvedFindPredicate[] = [];
			for (const predicate of branch) {
				switch (predicate.kind) {
					case 'name': {
						const pattern = yield* await evaluateExpandedWordEffect(
							predicate.pattern,
							fs,
							context
						);
						resolvedBranch.push({
							kind: 'name',
							matcher: picomatch(pattern, {
								bash: true,
								dot: true,
							}),
						});
						break;
					}
					case 'iname': {
						const pattern = yield* await evaluateExpandedWordEffect(
							predicate.pattern,
							fs,
							context
						);
						resolvedBranch.push({
							kind: 'name',
							matcher: picomatch(pattern, {
								bash: true,
								dot: true,
								nocase: true,
							}),
						});
						break;
					}
					case 'path': {
						const pattern = yield* await evaluateExpandedWordEffect(
							predicate.pattern,
							fs,
							context
						);
						resolvedBranch.push({
							kind: 'path',
							matcher: picomatch(pattern, {
								bash: true,
								dot: true,
							}),
						});
						break;
					}
					case 'ipath': {
						const pattern = yield* await evaluateExpandedWordEffect(
							predicate.pattern,
							fs,
							context
						);
						resolvedBranch.push({
							kind: 'path',
							matcher: picomatch(pattern, {
								bash: true,
								dot: true,
								nocase: true,
							}),
						});
						break;
					}
					case 'regex': {
						const pattern = yield* await evaluateExpandedWordEffect(
							predicate.pattern,
							fs,
							context
						);
						resolvedBranch.push({
							kind: 'regex',
							matcher: yield* Result.mapError(
								compileFindRegexMatcher(
									pattern,
									predicate.caseInsensitive
								),
								(cause) =>
									new ShellRuntimeError({
										cause,
										exitCode: 1,
										message:
											cause instanceof Error
												? cause.message
												: String(cause),
									})
							),
						});
						break;
					}
					case 'constant': {
						resolvedBranch.push({
							kind: 'constant',
							value: predicate.value,
						});
						break;
					}
					case 'empty': {
						resolvedBranch.push({
							kind: 'empty',
						});
						break;
					}
					case 'type': {
						resolvedBranch.push({
							kind: 'type',
							types: new Set(predicate.types),
						});
						break;
					}
					default: {
						const _exhaustive: never = predicate;
						return yield* new ShellRuntimeError({
							exitCode: 1,
							message: `Unsupported find predicate: ${JSON.stringify(_exhaustive)}`,
						});
					}
				}
			}
			resolved.push(resolvedBranch);
		}
		return Result.ok(resolved);
	});
}

function resolveStartPathsEffect(
	fs: FS,
	context: BuiltinContext,
	startPathWords: FindStep['args']['startPaths']
): ShellResult<FindResolvedPath[], ShellErrorCause> {
	return Result.gen(async function* () {
		const startPaths: FindResolvedPath[] = [];
		for (const word of startPathWords) {
			const expandedValues = yield* await evaluateExpandedPathWordEffect(
				'find',
				word,
				fs,
				context
			);
			for (const value of expandedValues) {
				const absolutePath = resolvePathFromCwd(context.cwd, value);
				startPaths.push({
					absolutePath,
					displayPath: toStartDisplayPath(
						value,
						absolutePath,
						context.cwd
					),
				});
			}
		}
		return Result.ok(startPaths);
	});
}

function matchesPredicates(
	entry: FindEntry,
	predicateBranches: ResolvedFindPredicate[][],
	childPaths: string[] | null
): boolean {
	if (predicateBranches.length === 0) {
		return true;
	}

	const entryType = entry.isDirectory ? 'd' : 'f';
	for (const branch of predicateBranches) {
		if (matchesBranch(entry, entryType, branch, childPaths)) {
			// Stop at the first matching branch to preserve left-to-right OR semantics.
			return true;
		}
	}
	return false;
}

function matchesBranch(
	entry: FindEntry,
	entryType: 'd' | 'f',
	branch: ResolvedFindPredicate[],
	childPaths: string[] | null
): boolean {
	for (const predicate of branch) {
		if (!matchesPredicate(entry, entryType, predicate, childPaths)) {
			return false;
		}
	}
	return true;
}

function matchesPredicate(
	entry: FindEntry,
	entryType: 'd' | 'f',
	predicate: ResolvedFindPredicate,
	childPaths: string[] | null
): boolean {
	if (predicate.kind === 'name') {
		return predicate.matcher(basename(entry.displayPath));
	}
	if (predicate.kind === 'path') {
		return predicate.matcher(entry.displayPath);
	}
	if (predicate.kind === 'regex') {
		return predicate.matcher(entry.displayPath);
	}
	if (predicate.kind === 'constant') {
		return predicate.value;
	}
	if (predicate.kind === 'empty') {
		if (entryType === 'f') {
			return entry.size === 0;
		}
		return childPaths !== null && childPaths.length === 0;
	}
	return predicate.types.has(entryType);
}

function compileFindRegexMatcher(
	pattern: string,
	caseInsensitive: boolean
): Result<(value: string) => boolean, unknown> {
	return Result.try({
		try: () => {
			const translatedPattern = translateFindRegexPattern(pattern);
			const flags = caseInsensitive ? 'i' : '';
			const regex = new RegExp(`^(?:${translatedPattern})$`, flags);
			return (value: string) => regex.test(value);
		},
		catch: (error) => error,
	});
}

function translateFindRegexPattern(pattern: string): string {
	let translated = '';

	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index];
		if (char === undefined) {
			continue;
		}
		if (char !== '\\') {
			translated += isEmacsLiteralJsMetaChar(char) ? `\\${char}` : char;
			continue;
		}

		const escapedChar = pattern[index + 1];
		if (escapedChar === undefined) {
			translated += '\\\\';
			continue;
		}

		index += 1;
		if (isEmacsEscapedOperatorChar(escapedChar)) {
			translated += escapedChar;
			continue;
		}

		translated += escapeJsRegexLiteralChar(escapedChar);
	}

	return translated;
}

function isEmacsEscapedOperatorChar(char: string): boolean {
	return (
		char === '(' ||
		char === ')' ||
		char === '|' ||
		char === '+' ||
		char === '?' ||
		char === '{' ||
		char === '}'
	);
}

function isEmacsLiteralJsMetaChar(char: string): boolean {
	return (
		char === '(' ||
		char === ')' ||
		char === '|' ||
		char === '+' ||
		char === '?' ||
		char === '{' ||
		char === '}'
	);
}

function escapeJsRegexLiteralChar(char: string): string {
	if (
		char === '\\' ||
		char === '^' ||
		char === '$' ||
		char === '.' ||
		char === '*' ||
		char === '+' ||
		char === '?' ||
		char === '(' ||
		char === ')' ||
		char === '[' ||
		char === ']' ||
		char === '{' ||
		char === '}' ||
		char === '|'
	) {
		return `\\${char}`;
	}
	return char;
}

async function readChildren(fs: FS, path: string): Promise<string[]> {
	const children: string[] = [];
	for await (const childPath of fs.readDirectory(path)) {
		children.push(childPath);
	}
	return children;
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

function appendDisplayPath(parentPath: string, childName: string): string {
	if (parentPath === '/') {
		return `/${childName}`;
	}
	if (parentPath === '.') {
		return `./${childName}`;
	}
	return `${parentPath}/${childName}`;
}

function basename(path: string): string {
	if (path === '/') {
		return '/';
	}
	const normalized = trimTrailingSlashes(path);
	const slashIndex = normalized.lastIndexOf('/');
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}

function diagnosticExitCode(error: unknown): number {
	if (isShellDiagnosticError(error)) {
		return error.exitCode;
	}
	return 1;
}

function writeErrorToStderr(context: BuiltinContext, error: unknown): void {
	if (isShellDiagnosticError(error)) {
		writeDiagnosticsToStderr(context, error.diagnostics);
		return;
	}
	appendStderrLines(context, [
		error instanceof Error ? error.message : String(error),
	]);
}

function toFileRecord(entry: FindEntry): FileRecord {
	return {
		displayPath: entry.displayPath,
		isDirectory: entry.isDirectory,
		kind: 'file',
		path: entry.absolutePath,
	};
}

function toRelativePathFromCwd(path: string, cwd: string): string | null {
	if (path === cwd) {
		return '.';
	}
	if (cwd === '/') {
		return path.startsWith('/') ? path.slice(1) : path;
	}
	const prefix = `${trimTrailingSlashes(cwd)}/`;
	if (!path.startsWith(prefix)) {
		return null;
	}
	return path.slice(prefix.length);
}

function toStartDisplayPath(
	rawValue: string,
	absolutePath: string,
	cwd: string
): string {
	if (rawValue.startsWith('/')) {
		return absolutePath;
	}

	const relativePath = toRelativePathFromCwd(absolutePath, cwd);
	if (relativePath === null) {
		return absolutePath;
	}
	if (relativePath === '.') {
		return '.';
	}
	if (rawValue === '.' || rawValue === './' || rawValue.startsWith('./')) {
		return `./${relativePath}`;
	}
	return relativePath;
}

function trimTrailingSlashes(path: string): string {
	if (path === '/') {
		return path;
	}
	return path.replace(/\/+$/g, '');
}
