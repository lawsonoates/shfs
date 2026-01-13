// ─────────────────────────────────────────────────────────
// Word Expansion Types (for new AST-based parser)
// ─────────────────────────────────────────────────────────

/**
 * Represents the result of word expansion.
 * Used by the new AST-based compiler to preserve expansion information.
 */
export type ExpandedWord =
	| { kind: 'literal'; value: string }
	| { kind: 'glob'; pattern: string; expanded: string[] }
	| { kind: 'commandSub'; command: string; output: string[] };

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
	target: ExpandedWord;
}

// ─────────────────────────────────────────────────────────
// Pipeline IR
// ─────────────────────────────────────────────────────────

export interface PipelineIR {
	source: SourceIR;
	steps: StepIR[];
	/** Store the first command for reference (may include globs, command subs) */
	firstCommand?: SimpleCommandIR;
}

export type SourceIR =
	| {
			kind: 'fs';
			glob: string;
	  }
	| {
			kind: 'stdin';
	  };

export interface CatStep {
	cmd: 'cat';
	args: {
		files: string[];
		numberLines?: boolean;
		numberNonBlank?: boolean;
		squeezeBlank?: boolean;
		showEnds?: boolean;
		showTabs?: boolean;
		showAll?: boolean;
		showNonprinting?: boolean;
	};
}

export interface CpStep {
	cmd: 'cp';
	args: { srcs: string[]; dest: string; recursive: boolean };
}

export interface HeadStep {
	cmd: 'head';
	args: { n: number; files: string[] };
}

export interface LsStep {
	cmd: 'ls';
	args: { paths: string[] };
}

export interface MkdirStep {
	cmd: 'mkdir';
	args: { paths: string[]; recursive: boolean };
}

export interface MvStep {
	cmd: 'mv';
	args: { srcs: string[]; dest: string };
}

export interface RmStep {
	cmd: 'rm';
	args: { paths: string[]; recursive: boolean };
}

export interface TailStep {
	cmd: 'tail';
	args: { n: number; files: string[] };
}

export interface TouchStep {
	cmd: 'touch';
	args: { files: string[] };
}

export type StepIR =
	| CatStep
	| CpStep
	| HeadStep
	| LsStep
	| MkdirStep
	| MvStep
	| RmStep
	| TailStep
	| TouchStep;

// ─────────────────────────────────────────────────────────
// Enhanced Step Types (for new AST-based compiler)
// ─────────────────────────────────────────────────────────

/**
 * Enhanced cat step with ExpandedWord support.
 */
export interface CatStepV2 {
	cmd: 'cat';
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
 * Enhanced cp step with ExpandedWord support.
 */
export interface CpStepV2 {
	cmd: 'cp';
	args: { srcs: ExpandedWord[]; dest: ExpandedWord; recursive: boolean };
}

/**
 * Enhanced head step with ExpandedWord support.
 */
export interface HeadStepV2 {
	cmd: 'head';
	args: { n: number; files: ExpandedWord[] };
}

/**
 * Enhanced ls step with ExpandedWord support.
 */
export interface LsStepV2 {
	cmd: 'ls';
	args: { paths: ExpandedWord[] };
}

/**
 * Enhanced mkdir step with ExpandedWord support.
 */
export interface MkdirStepV2 {
	cmd: 'mkdir';
	args: { paths: ExpandedWord[]; recursive: boolean };
}

/**
 * Enhanced mv step with ExpandedWord support.
 */
export interface MvStepV2 {
	cmd: 'mv';
	args: { srcs: ExpandedWord[]; dest: ExpandedWord };
}

/**
 * Enhanced rm step with ExpandedWord support.
 */
export interface RmStepV2 {
	cmd: 'rm';
	args: { paths: ExpandedWord[]; recursive: boolean };
}

/**
 * Enhanced tail step with ExpandedWord support.
 */
export interface TailStepV2 {
	cmd: 'tail';
	args: { n: number; files: ExpandedWord[] };
}

/**
 * Enhanced touch step with ExpandedWord support.
 */
export interface TouchStepV2 {
	cmd: 'touch';
	args: { files: ExpandedWord[] };
}

/**
 * Union of all enhanced step types.
 */
export type StepIRV2 =
	| CatStepV2
	| CpStepV2
	| HeadStepV2
	| LsStepV2
	| MkdirStepV2
	| MvStepV2
	| RmStepV2
	| TailStepV2
	| TouchStepV2;

/**
 * Enhanced PipelineIR with V2 steps.
 */
export interface PipelineIRV2 {
	source: SourceIR;
	steps: StepIRV2[];
	firstCommand?: SimpleCommandIR;
}

// ─────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────

/**
 * Create a literal ExpandedWord.
 */
export function literal(value: string): ExpandedWord {
	return { kind: 'literal', value };
}

/**
 * Create a glob ExpandedWord.
 */
export function glob(pattern: string, expanded: string[] = []): ExpandedWord {
	return { kind: 'glob', pattern, expanded };
}

/**
 * Create a command substitution ExpandedWord.
 */
export function commandSub(
	command: string,
	output: string[] = []
): ExpandedWord {
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
		default: {
			const _exhaustive: never = word;
			throw new Error(
				`Unknown word kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
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
			default: {
				const _exhaustive: never = word;
				throw new Error(
					`Unknown word kind: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	});
}
