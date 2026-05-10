import type { ShellDiagnostic } from './diagnostic';

// ─────────────────────────────────────────────────────────
// Word Expansion Types (for new AST-based parser)
// ─────────────────────────────────────────────────────────

/**
 * Represents one lossless part of a compiled shell word.
 */
export type ExpandedWordPart =
	| { kind: 'literal'; value: string }
	| { kind: 'glob'; pattern: string; expanded: string[] }
	| { kind: 'commandSub'; command: string; output: string[] };

/**
 * Represents the compiled shape of a shell word.
 * Mixed words are preserved as ordered compound parts instead of being flattened.
 */
export type ExpandedWord =
	| ExpandedWordPart
	| { kind: 'compound'; parts: ExpandedWordPart[] };

/**
 * Represents a simple command in IR form (for new AST-based compiler).
 */
export interface SimpleCommandIR {
	name: ExpandedWord;
	args: ExpandedWord[];
	redirections: RedirectionIR[];
}

/**
 * Represents a redirection in IR form.
 */
export interface RedirectionIR {
	kind: 'input' | 'output';
	mode?: 'file' | 'fd' | 'close' | 'pipe';
	sourceFd?: number;
	targetFd?: number | null;
	append?: boolean;
	noclobber?: boolean;
	optional?: boolean;
	target: ExpandedWord;
}

// ─────────────────────────────────────────────────────────
// Pipeline IR
// ─────────────────────────────────────────────────────────

export type SourceIR =
	| {
			kind: 'fs';
			glob: string;
	  }
	| {
			kind: 'stdin';
	  };

/**
 * Cd step.
 */
export interface CdStep {
	cmd: 'cd';
	redirections?: RedirectionIR[];
	args: {
		path: ExpandedWord;
	};
}

/**
 * Cat step with ExpandedWord support.
 */
export interface CatStep {
	cmd: 'cat';
	redirections?: RedirectionIR[];
	args: {
		files: ExpandedWord[];
		numberLines?: boolean;
		numberNonBlank?: boolean;
		squeezeBlank?: boolean;
		showEnds?: boolean;
		showTabs?: boolean;
		showAll?: boolean;
		showNonprinting?: boolean;
	};
}

/**
 * Cp step with ExpandedWord support.
 */
export interface CpStep {
	cmd: 'cp';
	redirections?: RedirectionIR[];
	args: {
		dest: ExpandedWord;
		force?: boolean;
		interactive?: boolean;
		recursive: boolean;
		srcs: ExpandedWord[];
	};
}

/**
 * Head step with ExpandedWord support.
 */
export interface HeadStep {
	cmd: 'head';
	redirections?: RedirectionIR[];
	args: { n: number; files: ExpandedWord[] };
}

/**
 * Ls step with ExpandedWord support.
 */
export interface LsStep {
	cmd: 'ls';
	redirections?: RedirectionIR[];
	args: { longFormat?: boolean; paths: ExpandedWord[]; showAll?: boolean };
}

/**
 * Mkdir step with ExpandedWord support.
 */
export interface MkdirStep {
	cmd: 'mkdir';
	redirections?: RedirectionIR[];
	args: { parents?: boolean; paths: ExpandedWord[]; recursive: boolean };
}

/**
 * Mv step with ExpandedWord support.
 */
export interface MvStep {
	cmd: 'mv';
	redirections?: RedirectionIR[];
	args: {
		dest: ExpandedWord;
		force?: boolean;
		interactive?: boolean;
		srcs: ExpandedWord[];
	};
}

/**
 * Rm step with ExpandedWord support.
 */
export interface RmStep {
	cmd: 'rm';
	redirections?: RedirectionIR[];
	args: {
		force?: boolean;
		interactive?: boolean;
		paths: ExpandedWord[];
		recursive: boolean;
	};
}

export type SortCheckModeIR = 'none' | 'diagnose-first' | 'quiet';

export interface SortKeyPositionIR {
	character: number | null;
	field: number;
}

export interface SortKeyOptionsIR {
	numeric: boolean;
}

export interface SortKeyIR {
	end: SortKeyPositionIR | null;
	options: SortKeyOptionsIR;
	raw: string;
	start: SortKeyPositionIR;
}

export interface SortArgsIR {
	checkMode: SortCheckModeIR;
	diagnostics: ShellDiagnostic[];
	fieldSeparator: string | null;
	files: ExpandedWord[];
	keys: SortKeyIR[];
	numeric: boolean;
	unique: boolean;
}

/**
 * Sort step.
 */
export interface SortStep {
	cmd: 'sort';
	redirections?: RedirectionIR[];
	args: SortArgsIR;
}

/**
 * Tail step with ExpandedWord support.
 */
export interface TailStep {
	cmd: 'tail';
	redirections?: RedirectionIR[];
	args: { n: number; files: ExpandedWord[] };
}

export interface TreeArgsIR {
	ascii: boolean;
	classify: boolean;
	dirsOnly: boolean;
	excludePatterns: ExpandedWord[];
	fullPath: boolean;
	includePatterns: ExpandedWord[];
	matchDirs: boolean;
	maxDepth: number | null;
	noReport: boolean;
	paths: ExpandedWord[];
	prune: boolean;
	showAll: boolean;
}

/**
 * Tree step with ExpandedWord support.
 */
export interface TreeStep {
	cmd: 'tree';
	redirections?: RedirectionIR[];
	args: TreeArgsIR;
}

/**
 * Touch step with ExpandedWord support.
 */
export interface TouchStep {
	cmd: 'touch';
	redirections?: RedirectionIR[];
	args: {
		accessTimeOnly?: boolean;
		files: ExpandedWord[];
		modificationTimeOnly?: boolean;
	};
}

/**
 * Pwd step.
 */
export interface PwdStep {
	cmd: 'pwd';
	redirections?: RedirectionIR[];
	args: Record<never, never>;
}

/**
 * Echo step.
 */
export interface EchoStep {
	cmd: 'echo';
	redirections?: RedirectionIR[];
	args: {
		values: ExpandedWord[];
	};
}

export type FindDiagnosticIR = ShellDiagnostic;

export type FindTypeIR = 'd' | 'f';

export type FindPredicateIR =
	| {
			kind: 'name';
			pattern: ExpandedWord;
	  }
	| {
			kind: 'iname';
			pattern: ExpandedWord;
	  }
	| {
			kind: 'path';
			pattern: ExpandedWord;
	  }
	| {
			kind: 'ipath';
			pattern: ExpandedWord;
	  }
	| {
			kind: 'regex';
			caseInsensitive: boolean;
			pattern: ExpandedWord;
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
			types: FindTypeIR[];
	  };

export interface FindActionIR {
	explicit: boolean;
	kind: 'print';
}

export interface FindTraversalIR {
	depth: boolean;
	maxdepth: number | null;
	mindepth: number;
}

export interface FindArgsIR {
	action: FindActionIR;
	diagnostics: FindDiagnosticIR[];
	predicateBranches: FindPredicateIR[][];
	startPaths: ExpandedWord[];
	traversal: FindTraversalIR;
	usageError: boolean;
}

/**
 * Find step.
 */
export interface FindStep {
	cmd: 'find';
	redirections?: RedirectionIR[];
	args: FindArgsIR;
}

export type GrepRegexMode = 'bre' | 'ere' | 'fixed' | 'pcre';
export type GrepFilenameMode = 'always' | 'default' | 'never';
export type GrepDirectoriesMode = 'read' | 'skip';

export type GrepDiagnosticIR = ShellDiagnostic;

export interface GrepOptionsIR {
	afterContext: number;
	beforeContext: number;
	binaryWithoutMatch: boolean;
	byteOffset: boolean;
	countOnly: boolean;
	directories: GrepDirectoriesMode;
	excludeDir: string[];
	excludeFiles: string[];
	filenameMode: GrepFilenameMode;
	help: boolean;
	ignoreCase: boolean;
	includeFiles: string[];
	invertMatch: boolean;
	lineNumber: boolean;
	lineRegexp: boolean;
	listFilesWithMatches: boolean;
	listFilesWithoutMatch: boolean;
	maxCount: number | null;
	mode: GrepRegexMode;
	noMessages: boolean;
	nullData: boolean;
	onlyMatching: boolean;
	quiet: boolean;
	recursive: boolean;
	textMode: boolean;
	version: boolean;
	wordRegexp: boolean;
}

export interface GrepArgsIR {
	diagnostics: GrepDiagnosticIR[];
	explicitPatterns: ExpandedWord[];
	fileOperands: ExpandedWord[];
	noPatternsYet: boolean;
	options: GrepOptionsIR;
	patternFiles: ExpandedWord[];
	usageError: boolean;
}

/**
 * Grep step.
 */
export interface GrepStep {
	cmd: 'grep';
	redirections?: RedirectionIR[];
	args: GrepArgsIR;
}

export interface XargsArgsIR {
	command: ExpandedWord[];
	delimiter: string | null;
	eof: string | null;
	maxArgs: number | null;
	maxLines: number | null;
	noRunIfEmpty: boolean;
	replace: string | null;
}

/**
 * Xargs step.
 */
export interface XargsStep {
	cmd: 'xargs';
	redirections?: RedirectionIR[];
	args: XargsArgsIR;
}

export type WcTotalMode = 'always' | 'auto' | 'invalid' | 'never' | 'only';

export interface WcArgsIR {
	bytes: boolean;
	chars: boolean;
	files: ExpandedWord[];
	files0From: ExpandedWord | null;
	lines: boolean;
	maxLineLength: boolean;
	total: WcTotalMode;
	words: boolean;
}

/**
 * Wc step.
 */
export interface WcStep {
	cmd: 'wc';
	redirections?: RedirectionIR[];
	args: WcArgsIR;
}

export type SetScope = 'global' | 'local';

/**
 * Set step.
 */
export interface SetStep {
	cmd: 'set';
	redirections?: RedirectionIR[];
	args: {
		scope: SetScope;
		name: ExpandedWord;
		values: ExpandedWord[];
	};
}

/**
 * Test step.
 */
export interface TestStep {
	cmd: 'test';
	redirections?: RedirectionIR[];
	args: {
		operands: ExpandedWord[];
	};
}

/**
 * Read step.
 */
export interface ReadStep {
	cmd: 'read';
	redirections?: RedirectionIR[];
	args: {
		name: ExpandedWord;
	};
}

/**
 * String step.
 */
export interface StringStep {
	cmd: 'string';
	redirections?: RedirectionIR[];
	args: {
		subcommand: ExpandedWord;
		operands: ExpandedWord[];
	};
}

/**
 * Union of all step types.
 */
export type StepIR =
	| CdStep
	| CatStep
	| CpStep
	| EchoStep
	| FindStep
	| GrepStep
	| HeadStep
	| LsStep
	| MkdirStep
	| MvStep
	| PwdStep
	| ReadStep
	| RmStep
	| SetStep
	| SortStep
	| StringStep
	| TailStep
	| TestStep
	| TouchStep
	| TreeStep
	| WcStep
	| XargsStep;

/**
 * PipelineIR with ExpandedWord support.
 */
export interface PipelineIR {
	source: SourceIR;
	steps: StepIR[];
	firstCommand?: SimpleCommandIR;
}

export type StatementChainModeIR = 'always' | 'and' | 'or';

export interface ScriptStatementIR {
	chainMode: StatementChainModeIR;
	pipeline: PipelineIR;
}

export interface ScriptIR {
	statements: ScriptStatementIR[];
}

// ─────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────

/**
 * Create a literal ExpandedWord.
 */
export function literal(value: string): ExpandedWordPart {
	return { kind: 'literal', value };
}

/**
 * Create a compound ExpandedWord that preserves ordered parts.
 */
export function compound(parts: ExpandedWordPart[]): ExpandedWord {
	return { kind: 'compound', parts };
}

/**
 * Create a SimpleCommandIR for testing purposes.
 * Convenience helper that creates a command with a name and arguments.
 */
export function cmd(
	name: string,
	args: ExpandedWord[],
	redirections: RedirectionIR[] = []
): SimpleCommandIR {
	return { name: literal(name), args, redirections };
}

/**
 * Create a glob ExpandedWord.
 */
export function glob(
	pattern: string,
	expanded: string[] = []
): ExpandedWordPart {
	return { kind: 'glob', pattern, expanded };
}

/**
 * Create a command substitution ExpandedWord.
 */
export function commandSub(
	command: string,
	output: string[] = []
): ExpandedWordPart {
	return { kind: 'commandSub', command, output };
}

/**
 * Extract the string value from an ExpandedWord.
 * For globs, returns the pattern. For command subs, returns the command.
 */
export function expandedWordToString(word: ExpandedWord): string {
	switch (word.kind) {
		case 'literal':
			return word.value;
		case 'glob':
			return word.pattern;
		case 'commandSub':
			return word.command;
		case 'compound':
			return word.parts.map(expandedWordPartToString).join('');
		default: {
			const _exhaustive: never = word;
			throw new Error(
				`Unknown word kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}

export function expandedWordParts(word: ExpandedWord): ExpandedWordPart[] {
	return word.kind === 'compound' ? word.parts : [word];
}

export function expandedWordHasGlob(word: ExpandedWord): boolean {
	return expandedWordParts(word).some((part) => part.kind === 'glob');
}

export function expandedWordHasCommandSub(word: ExpandedWord): boolean {
	return expandedWordParts(word).some((part) => part.kind === 'commandSub');
}

/**
 * Extract paths from an array of ExpandedWords.
 * For globs and command subs, expands to their resolved values.
 */
export function extractPathsFromExpandedWords(words: ExpandedWord[]): string[] {
	return words.flatMap((word): string[] => {
		switch (word.kind) {
			case 'literal':
				return [word.value];
			case 'glob':
				// Return expanded values if available, otherwise the pattern
				return word.expanded.length > 0
					? word.expanded
					: [word.pattern];
			case 'commandSub':
				return word.output;
			case 'compound':
				return [expandedWordToString(word)];
			default: {
				const _exhaustive: never = word;
				throw new Error(
					`Unknown word kind: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	});
}

function expandedWordPartToString(part: ExpandedWordPart): string {
	switch (part.kind) {
		case 'literal':
			return part.value;
		case 'glob':
			return part.pattern;
		case 'commandSub':
			return part.command;
		default: {
			const _exhaustive: never = part;
			throw new Error(
				`Unknown word part kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}
