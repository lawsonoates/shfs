/**
 * Abstract Syntax Tree (AST) node types for the Fish subset parser.
 *
 * This AST represents the simplified Fish shell subset:
 * - Pipelines (command | command | ...)
 * - Simple commands with arguments
 * - Command substitution (...)
 * - Globbing patterns
 * - Redirections (Phase 2)
 *
 * NOT supported: variables, control flow, functions, brace expansion
 */

import type { SourceSpan } from '../lexer/position';

// ─────────────────────────────────────────────────────────
// Visitor Pattern
// ─────────────────────────────────────────────────────────

/**
 * Visitor interface for traversing AST nodes.
 * Implement this to perform operations on the AST (compilation, printing, etc.)
 */
export interface Visitor<T> {
	visitProgram(node: Program): T;
	visitPipeline(node: Pipeline): T;
	visitSimpleCommand(node: SimpleCommand): T;
	visitWord(node: Word): T;
	visitLiteralPart(node: LiteralPart): T;
	visitGlobPart(node: GlobPart): T;
	visitCommandSubPart(node: CommandSubPart): T;
	visitRedirection(node: Redirection): T;
}

// ─────────────────────────────────────────────────────────
// Base AST Node
// ─────────────────────────────────────────────────────────

/**
 * Base class for all AST nodes.
 * Every node has a source span for error reporting.
 */
export abstract class ASTNode {
	readonly span: SourceSpan;

	constructor(span: SourceSpan) {
		this.span = span;
	}

	/**
	 * Accept a visitor (Visitor pattern).
	 */
	abstract accept<T>(visitor: Visitor<T>): T;
}

// ─────────────────────────────────────────────────────────
// Program (Root Node)
// ─────────────────────────────────────────────────────────

/**
 * Root AST node representing a complete program.
 * A program is a single pipeline (Fish subset does not support multiple statements).
 */
export class Program extends ASTNode {
	readonly pipeline: Pipeline;

	constructor(span: SourceSpan, pipeline: Pipeline) {
		super(span);
		this.pipeline = pipeline;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitProgram(this);
	}
}

// ─────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────

/**
 * A pipeline of one or more commands connected by pipes.
 * Example: `ls | grep foo | sort`
 */
export class Pipeline extends ASTNode {
	readonly commands: SimpleCommand[];

	constructor(span: SourceSpan, commands: SimpleCommand[]) {
		super(span);
		this.commands = commands;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitPipeline(this);
	}
}

// ─────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────

/**
 * A simple command with a name, arguments, and optional redirections.
 * Example: `grep -n pattern file.txt > output.txt`
 */
export class SimpleCommand extends ASTNode {
	/** The command name (first word) */
	readonly name: Word;
	/** Command arguments (remaining words) */
	readonly args: Word[];
	/** Redirections (Phase 2) */
	readonly redirections: Redirection[];

	constructor(
		span: SourceSpan,
		name: Word,
		args: Word[],
		redirections: Redirection[] = []
	) {
		super(span);
		this.name = name;
		this.args = args;
		this.redirections = redirections;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitSimpleCommand(this);
	}
}

// ─────────────────────────────────────────────────────────
// Words and Word Parts
// ─────────────────────────────────────────────────────────

/**
 * A word is a sequence of word parts.
 * Parts can be literals, globs, or command substitutions.
 * Example: `foo*.txt` has a literal part "foo", a glob part "*", and a literal part ".txt"
 */
export class Word extends ASTNode {
	readonly parts: WordPart[];
	/** True if the word was quoted (single or double) */
	readonly quoted: boolean;

	constructor(span: SourceSpan, parts: WordPart[], quoted = false) {
		super(span);
		this.parts = parts;
		this.quoted = quoted;
	}

	/**
	 * Get the literal value if this word has no expansions.
	 * Returns null if the word contains globs or command substitutions.
	 */
	get literalValue(): string | null {
		if (this.parts.every((p) => p.kind === 'literal')) {
			return this.parts.map((p) => (p as LiteralPart).value).join('');
		}
		return null;
	}

	/**
	 * Check if this word contains any glob patterns.
	 */
	get hasGlob(): boolean {
		return this.parts.some((p) => p.kind === 'glob');
	}

	/**
	 * Check if this word contains command substitution.
	 */
	get hasCommandSub(): boolean {
		return this.parts.some((p) => p.kind === 'commandSub');
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitWord(this);
	}
}

/**
 * Discriminated union type for word parts.
 */
export type WordPart = LiteralPart | GlobPart | CommandSubPart;

/**
 * Base interface for word parts with discriminant.
 */
interface WordPartBase {
	readonly kind: 'literal' | 'glob' | 'commandSub';
	readonly span: SourceSpan;
}

/**
 * A literal string part of a word.
 */
export class LiteralPart implements WordPartBase {
	readonly kind = 'literal' as const;
	readonly span: SourceSpan;
	readonly value: string;

	constructor(span: SourceSpan, value: string) {
		this.span = span;
		this.value = value;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitLiteralPart(this);
	}
}

/**
 * A glob pattern part of a word.
 * Examples: `*`, `?`, `[abc]`, `[a-z]`, `[!abc]`
 */
export class GlobPart implements WordPartBase {
	readonly kind = 'glob' as const;
	readonly span: SourceSpan;
	readonly pattern: string;

	constructor(span: SourceSpan, pattern: string) {
		this.span = span;
		this.pattern = pattern;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitGlobPart(this);
	}
}

/**
 * A command substitution part of a word.
 * Example: `(ls -la)`
 *
 * The inner program is parsed recursively.
 */
export class CommandSubPart implements WordPartBase {
	readonly kind = 'commandSub' as const;
	readonly span: SourceSpan;
	/** The inner program to execute */
	readonly program: Program;

	constructor(span: SourceSpan, program: Program) {
		this.span = span;
		this.program = program;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitCommandSubPart(this);
	}
}

// ─────────────────────────────────────────────────────────
// Redirections (Phase 2)
// ─────────────────────────────────────────────────────────

/**
 * Redirection type.
 */
export type RedirectionKind = 'input' | 'output';

/**
 * A redirection (input or output).
 * Examples: `< input.txt`, `> output.txt`
 */
export class Redirection extends ASTNode {
	readonly redirectKind: RedirectionKind;
	readonly target: Word;

	constructor(span: SourceSpan, redirectKind: RedirectionKind, target: Word) {
		super(span);
		this.redirectKind = redirectKind;
		this.target = target;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitRedirection(this);
	}
}
