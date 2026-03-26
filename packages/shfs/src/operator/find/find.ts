import {
	createRuntimeDiagnostic,
	type FindPredicateIR,
	type FindStep,
	hasErrorDiagnostics,
} from '@shfs/compiler';
import picomatch from 'picomatch';

import type { BuiltinContext } from '../../builtin/types';
import {
	diagnosticsToLineRecords,
	isShellDiagnosticError,
	statusForDiagnostics,
} from '../../diagnostics';
import {
	evaluateExpandedPathWord,
	evaluateExpandedWord,
	resolvePathFromCwd,
} from '../../execute/path';
import type { FS } from '../../fs/fs';
import type {
	FileRecord,
	LineRecord,
	Record as ShellRecord,
} from '../../record';
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
}

export async function* find(
	fs: FS,
	context: BuiltinContext,
	args: FindStep['args']
): Stream<ShellRecord> {
	if (hasErrorDiagnostics(args.diagnostics)) {
		context.status = statusForDiagnostics(args.diagnostics);
		yield* diagnosticsToLineRecords(args.diagnostics);
		return;
	}

	let resolvedPredicates: ResolvedFindPredicate[];
	try {
		resolvedPredicates = await resolvePredicates(
			args.predicates,
			fs,
			context
		);
	} catch (error) {
		context.status = diagnosticStatus(error);
		yield* errorToLines(error);
		return;
	}

	let startPaths: FindResolvedPath[];
	try {
		startPaths = await resolveStartPaths(fs, context, args.startPaths);
	} catch (error) {
		context.status = diagnosticStatus(error);
		yield* errorToLines(error);
		return;
	}

	const state: FindTraversalState = {
		hadError: false,
	};

	for (const startPath of startPaths) {
		let startStat: Awaited<ReturnType<FS['stat']>>;
		try {
			startStat = await fs.stat(startPath.absolutePath);
		} catch {
			state.hadError = true;
			yield* diagnosticsToLineRecords([
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
			{
				...startPath,
				depth: 0,
				isDirectory: startStat.isDirectory,
			},
			args,
			resolvedPredicates,
			state
		);
	}

	context.status = state.hadError ? 1 : 0;
}

async function* walkEntry(
	fs: FS,
	entry: FindEntry,
	args: FindStep['args'],
	predicates: ResolvedFindPredicate[],
	state: FindTraversalState
): Stream<ShellRecord> {
	const matches =
		entry.depth >= args.traversal.mindepth &&
		matchesPredicates(entry, predicates);

	if (!args.traversal.depth && matches) {
		yield toFileRecord(entry);
	}

	if (
		entry.isDirectory &&
		(args.traversal.maxdepth === null ||
			entry.depth < args.traversal.maxdepth)
	) {
		let childPaths: string[];
		try {
			childPaths = await readChildren(fs, entry.absolutePath);
		} catch {
			state.hadError = true;
			yield* diagnosticsToLineRecords([
				createRuntimeDiagnostic(
					'find',
					'unreadable-directory',
					'Unable to read directory',
					{
						path: entry.displayPath,
					}
				),
			]);
			childPaths = [];
		}

		for (const childAbsolutePath of childPaths) {
			let childStat: Awaited<ReturnType<FS['stat']>>;
			try {
				childStat = await fs.stat(childAbsolutePath);
			} catch {
				state.hadError = true;
				yield* diagnosticsToLineRecords([
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
				{
					absolutePath: childAbsolutePath,
					displayPath: appendDisplayPath(
						entry.displayPath,
						basename(childAbsolutePath)
					),
					depth: entry.depth + 1,
					isDirectory: childStat.isDirectory,
				},
				args,
				predicates,
				state
			);
		}
	}

	if (args.traversal.depth && matches) {
		yield toFileRecord(entry);
	}
}

async function resolvePredicates(
	predicates: FindPredicateIR[],
	fs: FS,
	context: BuiltinContext
): Promise<ResolvedFindPredicate[]> {
	const resolved: ResolvedFindPredicate[] = [];
	for (const predicate of predicates) {
		switch (predicate.kind) {
			case 'name': {
				const pattern = await evaluateExpandedWord(
					predicate.pattern,
					fs,
					context
				);
				resolved.push({
					kind: 'name',
					matcher: picomatch(pattern, {
						bash: true,
						dot: true,
					}),
				});
				break;
			}
			case 'path': {
				const pattern = await evaluateExpandedWord(
					predicate.pattern,
					fs,
					context
				);
				resolved.push({
					kind: 'path',
					matcher: picomatch(pattern, {
						bash: true,
						dot: true,
					}),
				});
				break;
			}
			case 'type': {
				resolved.push({
					kind: 'type',
					types: new Set(predicate.types),
				});
				break;
			}
			default: {
				const _exhaustive: never = predicate;
				throw new Error(
					`Unsupported find predicate: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	}
	return resolved;
}

async function resolveStartPaths(
	fs: FS,
	context: BuiltinContext,
	startPathWords: FindStep['args']['startPaths']
): Promise<FindResolvedPath[]> {
	const startPaths: FindResolvedPath[] = [];
	for (const word of startPathWords) {
		const expandedValues = await evaluateExpandedPathWord(
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
	return startPaths;
}

function matchesPredicates(
	entry: FindEntry,
	predicates: ResolvedFindPredicate[]
): boolean {
	for (const predicate of predicates) {
		if (predicate.kind === 'name') {
			if (!predicate.matcher(basename(entry.displayPath))) {
				return false;
			}
			continue;
		}
		if (predicate.kind === 'path') {
			if (!predicate.matcher(entry.displayPath)) {
				return false;
			}
			continue;
		}
		const entryType = entry.isDirectory ? 'd' : 'f';
		if (!predicate.types.has(entryType)) {
			return false;
		}
	}
	return true;
}

async function readChildren(fs: FS, path: string): Promise<string[]> {
	const children: string[] = [];
	for await (const childPath of fs.readdir(path)) {
		children.push(childPath);
	}
	return children;
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

function diagnosticStatus(error: unknown): number {
	if (isShellDiagnosticError(error)) {
		return error.status;
	}
	return 1;
}

function* errorToLines(error: unknown): Generator<LineRecord> {
	if (isShellDiagnosticError(error)) {
		yield* diagnosticsToLineRecords(error.diagnostics);
		return;
	}
	yield {
		kind: 'line',
		text: error instanceof Error ? error.message : String(error),
	};
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
