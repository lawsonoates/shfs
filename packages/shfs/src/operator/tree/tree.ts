import type { TreeArgsIR } from '@shfs/compiler';
import { Result } from 'better-result';
import picomatch from 'picomatch';

import { normalizeAbsolutePath, resolvePathFromCwd } from '../../execute/path';
import type { FS } from '../../fs/fs';

interface TreePatternSet {
	matchers: Array<(value: string) => boolean>;
}

interface TreeResolvedArgs {
	ascii: boolean;
	classify: boolean;
	dirsOnly: boolean;
	excludePatterns: TreePatternSet;
	fullPath: boolean;
	includePatterns: TreePatternSet;
	matchDirs: boolean;
	maxDepth: number | null;
	noReport: boolean;
	paths: string[];
	prune: boolean;
	showAll: boolean;
}

interface TreeEntry {
	children: TreeEntry[];
	displayName: string;
	isDirectory: boolean;
	isSymlink: boolean;
	path: string;
}

interface TreeTotals {
	dirs: number;
	files: number;
}

interface LineDrawing {
	blank: string;
	last: string;
	mid: string;
	pipe: string;
}

export interface TreeCommandResult {
	exitCode: number;
	stderr: string[];
	stdout: string[];
}

const ROOT_DIRECTORY = '/';
const TRAILING_SLASH_REGEX = /\/+$/;

const LINE_DRAWING: Record<'ascii' | 'utf8', LineDrawing> = {
	ascii: {
		blank: '    ',
		last: '`-- ',
		mid: '|-- ',
		pipe: '|   ',
	},
	utf8: {
		blank: '    ',
		last: '└── ',
		mid: '├── ',
		pipe: '│   ',
	},
} as const;

export async function runTreeCommand(
	fs: FS,
	cwd: string,
	args: TreeResolvedArgs
): Promise<TreeCommandResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const totals: TreeTotals = { dirs: 0, files: 0 };
	let exitCode = 0;

	for (const path of args.paths) {
		const resolvedPath = resolvePathFromCwd(cwd, path);
		const stat = await statOrNull(fs, resolvedPath);
		if (stat === null) {
			stderr.push(`tree: ${path}: No such file or directory`);
			exitCode = 1;
			continue;
		}

		const rootEntry = await buildTreeEntry({
			args,
			depth: 0,
			forceIncludeAll: false,
			fs,
			isDirectory: stat.type === 'Directory',
			isSymlink: await isSymlink(fs, resolvedPath),
			path: resolvedPath,
			rootDisplayPath: path,
		});

		if (!rootEntry) {
			continue;
		}

		appendRenderedTree(stdout, rootEntry, args);
		accumulateTotals(rootEntry, totals);
	}

	if (!args.noReport) {
		appendReport(stdout, totals, args);
	}

	return { exitCode, stderr, stdout };
}

export function createTreeResolvedArgs(
	args: Omit<TreeArgsIR, 'paths' | 'includePatterns' | 'excludePatterns'> & {
		excludePatterns: string[];
		includePatterns: string[];
		paths: string[];
	}
): TreeResolvedArgs {
	return {
		...args,
		excludePatterns: createPatternSet(args.excludePatterns),
		includePatterns: createPatternSet(args.includePatterns),
	};
}

async function buildTreeEntry({
	args,
	depth,
	forceIncludeAll,
	fs,
	isDirectory,
	isSymlink,
	path,
	rootDisplayPath,
}: {
	args: TreeResolvedArgs;
	depth: number;
	forceIncludeAll: boolean;
	fs: FS;
	isDirectory: boolean;
	isSymlink: boolean;
	path: string;
	rootDisplayPath: string;
}): Promise<TreeEntry | null> {
	const name = basename(path);
	const isRoot = depth === 0;
	const displayName = isRoot
		? formatRootDisplayName(
				rootDisplayPath,
				path,
				isDirectory,
				isSymlink,
				args
			)
		: formatChildDisplayName(path, isDirectory, isSymlink, args);

	if (!isRoot && shouldHide(name, args)) {
		return null;
	}
	if (!isRoot && matchesPattern(args.excludePatterns, name, path)) {
		return null;
	}
	if (!isRoot && args.dirsOnly && !isDirectory) {
		return null;
	}

	if (!isDirectory) {
		if (
			!forceIncludeAll &&
			args.includePatterns.matchers.length > 0 &&
			!matchesPattern(args.includePatterns, name, path)
		) {
			return null;
		}
		return { children: [], displayName, isDirectory, isSymlink, path };
	}

	const dirMatchesInclude =
		!isRoot &&
		args.matchDirs &&
		matchesPattern(args.includePatterns, name, path);
	const childForceIncludeAll = forceIncludeAll || dirMatchesInclude;
	const children =
		canDescend(depth, args) && isDirectory
			? await buildChildEntries({
					args,
					depth,
					forceIncludeAll: childForceIncludeAll,
					fs,
					path,
				})
			: [];

	if (!isRoot && args.prune && !dirMatchesInclude && children.length === 0) {
		return null;
	}

	return { children, displayName, isDirectory, isSymlink, path };
}

async function buildChildEntries({
	args,
	depth,
	forceIncludeAll,
	fs,
	path,
}: {
	args: TreeResolvedArgs;
	depth: number;
	forceIncludeAll: boolean;
	fs: FS;
	path: string;
}): Promise<TreeEntry[]> {
	const childPathResult = await Result.tryPromise({
		try: () => readSortedChildren(fs, path),
		catch: (error) => error,
	});
	const childPaths = childPathResult.match({
		err: () => [],
		ok: (paths) => paths,
	});
	const entries: TreeEntry[] = [];
	for (const childPath of childPaths) {
		const childDepth = depth + 1;
		if (args.maxDepth !== null && childDepth > args.maxDepth) {
			continue;
		}
		const stat = await statOrNull(fs, childPath);
		if (stat === null) {
			continue;
		}
		const isChildSymlink = await isSymlink(fs, childPath);
		const childEntry = await buildTreeEntry({
			args,
			depth: childDepth,
			forceIncludeAll,
			fs,
			isDirectory: stat.type === 'Directory',
			isSymlink: isChildSymlink,
			path: childPath,
			rootDisplayPath: childPath,
		});
		if (childEntry) {
			entries.push(childEntry);
		}
	}
	return entries;
}

async function readSortedChildren(fs: FS, path: string): Promise<string[]> {
	const children: string[] = [];
	for await (const childPath of fs.readDirectory(path)) {
		children.push(childPath);
	}
	children.sort((left, right) =>
		basename(left).localeCompare(basename(right))
	);
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

function isSymlink(fs: FS, path: string): Promise<boolean> {
	return Result.tryPromise({
		try: () => fs.readLink(path),
		catch: (error) => error,
	}).then((result) => Result.isOk(result));
}

function appendRenderedTree(
	stdout: string[],
	rootEntry: TreeEntry,
	args: TreeResolvedArgs
): void {
	stdout.push(rootEntry.displayName);
	const drawing = args.ascii ? LINE_DRAWING.ascii : LINE_DRAWING.utf8;
	for (const [index, child] of rootEntry.children.entries()) {
		appendRenderedEntry({
			drawing,
			entry: child,
			isLast: index === rootEntry.children.length - 1,
			prefix: '',
			stdout,
		});
	}
}

function appendRenderedEntry({
	drawing,
	entry,
	isLast,
	prefix,
	stdout,
}: {
	drawing: LineDrawing;
	entry: TreeEntry;
	isLast: boolean;
	prefix: string;
	stdout: string[];
}): void {
	stdout.push(
		`${prefix}${isLast ? drawing.last : drawing.mid}${entry.displayName}`
	);
	const childPrefix = `${prefix}${isLast ? drawing.blank : drawing.pipe}`;
	for (const [index, child] of entry.children.entries()) {
		appendRenderedEntry({
			drawing,
			entry: child,
			isLast: index === entry.children.length - 1,
			prefix: childPrefix,
			stdout,
		});
	}
}

function appendReport(
	stdout: string[],
	totals: TreeTotals,
	args: TreeResolvedArgs
): void {
	stdout.push('');
	if (args.dirsOnly) {
		stdout.push(
			`${totals.dirs} ${totals.dirs === 1 ? 'directory' : 'directories'}`
		);
		return;
	}
	stdout.push(
		`${totals.dirs} ${totals.dirs === 1 ? 'directory' : 'directories'}, ${totals.files} ${totals.files === 1 ? 'file' : 'files'}`
	);
}

function accumulateTotals(entry: TreeEntry, totals: TreeTotals): void {
	if (entry.isDirectory) {
		totals.dirs += 1;
	} else {
		totals.files += 1;
	}
	for (const child of entry.children) {
		accumulateTotals(child, totals);
	}
}

function createPatternSet(patterns: string[]): TreePatternSet {
	const expandedPatterns = patterns.flatMap(splitAlternatePatterns);
	return {
		matchers: expandedPatterns.map((pattern) =>
			picomatch(pattern, { bash: true, dot: true })
		),
	};
}

function splitAlternatePatterns(pattern: string): string[] {
	return pattern
		.split('|')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function matchesPattern(
	patterns: TreePatternSet,
	name: string,
	path: string
): boolean {
	if (patterns.matchers.length === 0) {
		return false;
	}
	const normalizedPath = normalizeAbsolutePath(path);
	const relativePath = normalizedPath.startsWith(ROOT_DIRECTORY)
		? normalizedPath.slice(1)
		: normalizedPath;
	return patterns.matchers.some(
		(matcher) => matcher(name) || matcher(relativePath)
	);
}

function shouldHide(name: string, args: TreeResolvedArgs): boolean {
	return !args.showAll && name.startsWith('.');
}

function canDescend(depth: number, args: TreeResolvedArgs): boolean {
	return args.maxDepth === null || depth < args.maxDepth;
}

function formatRootDisplayName(
	displayPath: string,
	resolvedPath: string,
	isDirectory: boolean,
	isSymlink: boolean,
	args: TreeResolvedArgs
): string {
	const rootName = args.fullPath ? resolvedPath : displayPath;
	if (args.classify) {
		return classifyDisplayName(rootName, isDirectory, isSymlink);
	}
	return rootName;
}

function formatChildDisplayName(
	path: string,
	isDirectory: boolean,
	isSymlink: boolean,
	args: TreeResolvedArgs
): string {
	const displayName = args.fullPath ? path : basename(path);
	if (args.classify) {
		return classifyDisplayName(displayName, isDirectory, isSymlink);
	}
	return displayName;
}

function classifyDisplayName(
	displayName: string,
	isDirectory: boolean,
	isSymlink: boolean
): string {
	if (isSymlink) {
		return `${displayName}@`;
	}
	if (isDirectory) {
		return withDirectorySlash(displayName);
	}
	return displayName;
}

function withDirectorySlash(path: string): string {
	if (path === ROOT_DIRECTORY || path.endsWith(ROOT_DIRECTORY)) {
		return path;
	}
	return `${path}/`;
}

function basename(path: string): string {
	const normalized = path.replace(TRAILING_SLASH_REGEX, '');
	const slashIndex = normalized.lastIndexOf(ROOT_DIRECTORY);
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}
