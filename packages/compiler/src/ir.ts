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

/**
 * Tail step with ExpandedWord support.
 */
export interface TailStep {
	cmd: 'tail';
	redirections?: RedirectionIR[];
	args: { n: number; files: ExpandedWord[] };
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

/**
 * Grep step.
 */
export interface GrepStep {
	cmd: 'grep';
	redirections?: RedirectionIR[];
	args: {
		argv: ExpandedWord[];
	};
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
	| GrepStep
	| HeadStep
	| LsStep
	| MkdirStep
	| MvStep
	| PwdStep
	| ReadStep
	| RmStep
	| SetStep
	| StringStep
	| TailStep
	| TestStep
	| TouchStep;

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
export function literal(value: string): ExpandedWord {
	return { kind: 'literal', value };
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
