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
	| {
			kind: 'commandSub';
			command: string;
			output: string[];
			/** True when the substitution appeared inside double quotes. */
			quoted?: boolean;
			/** Raw index expression text (without brackets), if sliced. */
			index?: string | null;
	  }
	| {
			kind: 'variable';
			name: string;
			/** True when the expansion appeared inside double quotes. */
			quoted: boolean;
			/** Raw index expression text (without brackets), if sliced. */
			index: string | null;
	  };

/**
 * Represents the compiled shape of a shell word.
 * Mixed words are preserved as ordered compound parts instead of being flattened.
 */
export type ExpandedWord =
	| ExpandedWordPart
	| { kind: 'compound'; parts: ExpandedWordPart[] };

/**
 * A command-scoped variable assignment (`name=value command`).
 */
export interface AssignmentIR {
	name: string;
	value: ExpandedWord;
}

/**
 * Represents a simple command in IR form (for new AST-based compiler).
 */
export interface SimpleCommandIR {
	name: ExpandedWord;
	args: ExpandedWord[];
	redirections: RedirectionIR[];
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
	args: { n: number; files: ExpandedWord[] };
}

/**
 * Ls step with ExpandedWord support.
 */
export interface LsStep {
	cmd: 'ls';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: { longFormat?: boolean; paths: ExpandedWord[]; showAll?: boolean };
}

/**
 * Mkdir step with ExpandedWord support.
 */
export interface MkdirStep {
	cmd: 'mkdir';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: { parents?: boolean; paths: ExpandedWord[]; recursive: boolean };
}

/**
 * Mv step with ExpandedWord support.
 */
export interface MvStep {
	cmd: 'mv';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
	args: SortArgsIR;
}

/**
 * Tail step with ExpandedWord support.
 */
export interface TailStep {
	cmd: 'tail';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
	args: TreeArgsIR;
}

/**
 * Touch step with ExpandedWord support.
 */
export interface TouchStep {
	cmd: 'touch';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
	args: Record<never, never>;
}

/**
 * Echo step.
 */
export interface EchoStep {
	cmd: 'echo';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		values: ExpandedWord[];
	};
}

export type FindDiagnosticIR = ShellDiagnostic;

export type FindSymlinkModeIR = 'command-line' | 'logical' | 'physical';

export type FindTypeIR = 'd' | 'f' | 'l';

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
	  }
	| {
			kind: 'xtype';
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
	symlinkMode: FindSymlinkModeIR;
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
	assignments?: AssignmentIR[];
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
	dereferenceRecursive: boolean;
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
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
	assignments?: AssignmentIR[];
	args: WcArgsIR;
}

export type SetScope = 'auto' | 'global' | 'local';
export type SetMode = 'assign' | 'erase' | 'query';

/**
 * Set step.
 */
export interface SetStep {
	cmd: 'set';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		scope: SetScope;
		mode: SetMode;
		append: boolean;
		prepend: boolean;
		names: ExpandedWord[];
		values: ExpandedWord[];
	};
}

/**
 * Test step (also used for the `[` alias).
 */
export interface TestStep {
	cmd: 'test';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		operands: ExpandedWord[];
		bracket: boolean;
	};
}

/**
 * True step.
 */
export interface TrueStep {
	cmd: 'true';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: Record<never, never>;
}

/**
 * False step.
 */
export interface FalseStep {
	cmd: 'false';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: Record<never, never>;
}

/**
 * Count step.
 */
export interface CountStep {
	cmd: 'count';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		values: ExpandedWord[];
	};
}

/**
 * Call step: invocation of a runtime-defined function (or an unknown
 * command reported at runtime).
 */
export interface CallStep {
	cmd: 'call';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		name: string;
		words: ExpandedWord[];
	};
}

/**
 * Read step.
 */
export interface ReadStep {
	cmd: 'read';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		name: ExpandedWord;
	};
}

/**
 * String step. A missing subcommand is reported at runtime.
 */
export interface StringStep {
	cmd: 'string';
	redirections?: RedirectionIR[];
	assignments?: AssignmentIR[];
	args: {
		subcommand: ExpandedWord | null;
		operands: ExpandedWord[];
	};
}

/**
 * Union of all step types.
 */
export type StepIR =
	| CallStep
	| CdStep
	| CatStep
	| CountStep
	| CpStep
	| EchoStep
	| FalseStep
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
	| TrueStep
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

/**
 * A job statement: a pipeline plus chain metadata and negation.
 */
export interface JobStatementIR {
	kind: 'job';
	chainMode: StatementChainModeIR;
	negated: boolean;
	pipeline: PipelineIR;
}

export interface IfBranchIR {
	condition: StatementIR[];
	body: StatementIR[];
}

export interface IfStatementIR {
	kind: 'if';
	chainMode: StatementChainModeIR;
	negated: boolean;
	assignments: AssignmentIR[];
	branches: IfBranchIR[];
	elseBody: StatementIR[] | null;
}

export interface SwitchCaseIR {
	patterns: ExpandedWord[];
	body: StatementIR[];
}

export interface SwitchStatementIR {
	kind: 'switch';
	chainMode: StatementChainModeIR;
	negated: boolean;
	assignments: AssignmentIR[];
	value: ExpandedWord;
	cases: SwitchCaseIR[];
}

export interface WhileStatementIR {
	kind: 'while';
	chainMode: StatementChainModeIR;
	negated: boolean;
	assignments: AssignmentIR[];
	condition: StatementIR[];
	body: StatementIR[];
}

export interface ForStatementIR {
	kind: 'for';
	chainMode: StatementChainModeIR;
	variable: string;
	values: ExpandedWord[];
	body: StatementIR[];
}

export interface BeginStatementIR {
	kind: 'begin';
	chainMode: StatementChainModeIR;
	negated: boolean;
	assignments: AssignmentIR[];
	body: StatementIR[];
}

export interface FunctionStatementIR {
	kind: 'function';
	chainMode: StatementChainModeIR;
	name: string;
	argumentNames: string[];
	body: StatementIR[];
}

export interface BreakStatementIR {
	kind: 'break';
	chainMode: StatementChainModeIR;
}

export interface ContinueStatementIR {
	kind: 'continue';
	chainMode: StatementChainModeIR;
}

export interface ReturnStatementIR {
	kind: 'return';
	chainMode: StatementChainModeIR;
	values: ExpandedWord[];
}

export type StatementIR =
	| JobStatementIR
	| IfStatementIR
	| SwitchStatementIR
	| WhileStatementIR
	| ForStatementIR
	| BeginStatementIR
	| FunctionStatementIR
	| BreakStatementIR
	| ContinueStatementIR
	| ReturnStatementIR;

export interface ScriptIR {
	statements: StatementIR[];
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
	output: string[] = [],
	options: { quoted?: boolean; index?: string | null } = {}
): ExpandedWordPart {
	return {
		kind: 'commandSub',
		command,
		output,
		quoted: options.quoted ?? false,
		index: options.index ?? null,
	};
}

/**
 * Create a variable ExpandedWord.
 */
export function variable(
	name: string,
	options: { quoted?: boolean; index?: string | null } = {}
): ExpandedWordPart {
	return {
		kind: 'variable',
		name,
		quoted: options.quoted ?? false,
		index: options.index ?? null,
	};
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
		case 'variable':
			return `$${word.name}`;
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
			case 'variable':
				return [`$${word.name}`];
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
		case 'variable':
			return `$${part.name}`;
		default: {
			const _exhaustive: never = part;
			throw new Error(
				`Unknown word part kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}
