/**
 * Abstract Syntax Tree (AST) node types for the Fish subset parser.
 *
 * This AST represents the fish scripting subset:
 * - Pipelines (command | command | ...)
 * - Simple commands with arguments and command-scoped assignments
 * - Statement chaining (&&, ||, `; and`, `; or`) and negation (not/!)
 * - Blocks and control flow (begin, if, while, for, function)
 * - Command substitution (...) and $(...)
 * - Variable expansion ($name, $name[...])
 * - Globbing patterns
 * - Redirections
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
	visitStatement(node: Statement): T;
	visitIfStatement(node: IfStatement): T;
	visitWhileStatement(node: WhileStatement): T;
	visitForStatement(node: ForStatement): T;
	visitBeginStatement(node: BeginStatement): T;
	visitFunctionStatement(node: FunctionStatement): T;
	visitBreakStatement(node: BreakStatement): T;
	visitContinueStatement(node: ContinueStatement): T;
	visitReturnStatement(node: ReturnStatement): T;
	visitPipeline(node: Pipeline): T;
	visitSimpleCommand(node: SimpleCommand): T;
	visitWord(node: Word): T;
	visitLiteralPart(node: LiteralPart): T;
	visitGlobPart(node: GlobPart): T;
	visitCommandSubPart(node: CommandSubPart): T;
	visitVariablePart(node: VariablePart): T;
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
 * A program is an ordered list of statements.
 */
export class Program extends ASTNode {
	readonly statements: StatementNode[];

	constructor(span: SourceSpan, statements: StatementNode[]) {
		super(span);
		this.statements = statements;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitProgram(this);
	}
}

export type StatementChainMode = 'always' | 'and' | 'or';

/**
 * Union of every node that can appear in statement position.
 */
export type StatementNode =
	| Statement
	| IfStatement
	| WhileStatement
	| ForStatement
	| BeginStatement
	| FunctionStatement
	| BreakStatement
	| ContinueStatement
	| ReturnStatement;

/**
 * A command-scoped variable assignment prefix (`name=value command`).
 */
export class Assignment extends ASTNode {
	readonly name: string;
	readonly value: Word;

	constructor(span: SourceSpan, name: string, value: Word) {
		super(span);
		this.name = name;
		this.value = value;
	}

	accept<T>(_visitor: Visitor<T>): T {
		throw new Error('Assignment nodes are traversed via their statement');
	}
}

/**
 * A job statement containing a pipeline and chain metadata.
 */
export class Statement extends ASTNode {
	readonly pipeline: Pipeline;
	readonly chainMode: StatementChainMode;
	readonly negated: boolean;

	constructor(
		span: SourceSpan,
		pipeline: Pipeline,
		chainMode: StatementChainMode = 'always',
		negated = false
	) {
		super(span);
		this.pipeline = pipeline;
		this.chainMode = chainMode;
		this.negated = negated;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitStatement(this);
	}
}

/**
 * One `if`/`else if` branch: a condition statement list and a body.
 */
export interface IfBranch {
	readonly condition: StatementNode[];
	readonly body: StatementNode[];
}

/**
 * An `if ... else if ... else ... end` statement.
 */
export class IfStatement extends ASTNode {
	readonly branches: IfBranch[];
	readonly elseBody: StatementNode[] | null;
	readonly chainMode: StatementChainMode;
	readonly negated: boolean;
	readonly assignments: Assignment[];

	constructor(
		span: SourceSpan,
		branches: IfBranch[],
		elseBody: StatementNode[] | null,
		chainMode: StatementChainMode = 'always',
		negated = false,
		assignments: Assignment[] = []
	) {
		super(span);
		this.branches = branches;
		this.elseBody = elseBody;
		this.chainMode = chainMode;
		this.negated = negated;
		this.assignments = assignments;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitIfStatement(this);
	}
}

/**
 * A `while ... end` loop.
 */
export class WhileStatement extends ASTNode {
	readonly condition: StatementNode[];
	readonly body: StatementNode[];
	readonly chainMode: StatementChainMode;
	readonly negated: boolean;
	readonly assignments: Assignment[];

	constructor(
		span: SourceSpan,
		condition: StatementNode[],
		body: StatementNode[],
		chainMode: StatementChainMode = 'always',
		negated = false,
		assignments: Assignment[] = []
	) {
		super(span);
		this.condition = condition;
		this.body = body;
		this.chainMode = chainMode;
		this.negated = negated;
		this.assignments = assignments;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitWhileStatement(this);
	}
}

/**
 * A `for name in words ... end` loop.
 */
export class ForStatement extends ASTNode {
	readonly variable: string;
	readonly values: Word[];
	readonly body: StatementNode[];
	readonly chainMode: StatementChainMode;

	constructor(
		span: SourceSpan,
		variable: string,
		values: Word[],
		body: StatementNode[],
		chainMode: StatementChainMode = 'always'
	) {
		super(span);
		this.variable = variable;
		this.values = values;
		this.body = body;
		this.chainMode = chainMode;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitForStatement(this);
	}
}

/**
 * A `begin ... end` block.
 */
export class BeginStatement extends ASTNode {
	readonly body: StatementNode[];
	readonly chainMode: StatementChainMode;
	readonly negated: boolean;
	readonly assignments: Assignment[];

	constructor(
		span: SourceSpan,
		body: StatementNode[],
		chainMode: StatementChainMode = 'always',
		negated = false,
		assignments: Assignment[] = []
	) {
		super(span);
		this.body = body;
		this.chainMode = chainMode;
		this.negated = negated;
		this.assignments = assignments;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitBeginStatement(this);
	}
}

/**
 * A `function name ... end` definition.
 */
export class FunctionStatement extends ASTNode {
	readonly name: string;
	readonly argumentNames: string[];
	readonly body: StatementNode[];
	readonly chainMode: StatementChainMode;

	constructor(
		span: SourceSpan,
		name: string,
		argumentNames: string[],
		body: StatementNode[],
		chainMode: StatementChainMode = 'always'
	) {
		super(span);
		this.name = name;
		this.argumentNames = argumentNames;
		this.body = body;
		this.chainMode = chainMode;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitFunctionStatement(this);
	}
}

/**
 * A `break` statement.
 */
export class BreakStatement extends ASTNode {
	readonly chainMode: StatementChainMode;

	constructor(span: SourceSpan, chainMode: StatementChainMode = 'always') {
		super(span);
		this.chainMode = chainMode;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitBreakStatement(this);
	}
}

/**
 * A `continue` statement.
 */
export class ContinueStatement extends ASTNode {
	readonly chainMode: StatementChainMode;

	constructor(span: SourceSpan, chainMode: StatementChainMode = 'always') {
		super(span);
		this.chainMode = chainMode;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitContinueStatement(this);
	}
}

/**
 * A `return [status]` statement.
 */
export class ReturnStatement extends ASTNode {
	readonly values: Word[];
	readonly chainMode: StatementChainMode;

	constructor(
		span: SourceSpan,
		values: Word[],
		chainMode: StatementChainMode = 'always'
	) {
		super(span);
		this.values = values;
		this.chainMode = chainMode;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitReturnStatement(this);
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
	/** Command-scoped variable assignments (`name=value command`) */
	readonly assignments: Assignment[];

	constructor(
		span: SourceSpan,
		name: Word,
		args: Word[],
		redirections: Redirection[] = [],
		assignments: Assignment[] = []
	) {
		super(span);
		this.name = name;
		this.args = args;
		this.redirections = redirections;
		this.assignments = assignments;
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
export type WordPart = LiteralPart | GlobPart | CommandSubPart | VariablePart;

/**
 * Base interface for word parts with discriminant.
 */
interface WordPartBase {
	readonly kind: 'literal' | 'glob' | 'commandSub' | 'variable';
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
 * Examples: `(ls -la)`, `$(ls -la)`, `(cmd)[2]`
 *
 * The inner program is parsed recursively for early syntax validation;
 * the raw source is kept for runtime execution.
 */
export class CommandSubPart implements WordPartBase {
	readonly kind = 'commandSub' as const;
	readonly span: SourceSpan;
	/** The inner program to execute */
	readonly program: Program;
	/** Raw inner source text (without the parens) */
	readonly source: string;
	/** True when the substitution appeared inside double quotes */
	readonly quoted: boolean;
	/** Raw index expression text (without brackets), if sliced */
	readonly index: string | null;

	constructor(
		span: SourceSpan,
		program: Program,
		source: string,
		quoted = false,
		index: string | null = null
	) {
		this.span = span;
		this.program = program;
		this.source = source;
		this.quoted = quoted;
		this.index = index;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitCommandSubPart(this);
	}
}

/**
 * A variable expansion part of a word.
 * Examples: `$name`, `$name[1]`, `$name[2..-1]`
 */
export class VariablePart implements WordPartBase {
	readonly kind = 'variable' as const;
	readonly span: SourceSpan;
	/** The variable name (without the dollar sign) */
	readonly name: string;
	/** True when the expansion appeared inside double quotes */
	readonly quoted: boolean;
	/** Raw index expression text (without brackets), if sliced */
	readonly index: string | null;

	constructor(
		span: SourceSpan,
		name: string,
		quoted = false,
		index: string | null = null
	) {
		this.span = span;
		this.name = name;
		this.quoted = quoted;
		this.index = index;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitVariablePart(this);
	}
}

// ─────────────────────────────────────────────────────────
// Redirections (Phase 2)
// ─────────────────────────────────────────────────────────

/**
 * Redirection type.
 */
export type RedirectionKind = 'input' | 'output';
export type RedirectionMode = 'file' | 'fd' | 'close' | 'pipe';

/**
 * A redirection (input or output).
 * Examples: `< input.txt`, `> output.txt`
 */
export class Redirection extends ASTNode {
	readonly redirectKind: RedirectionKind;
	readonly mode: RedirectionMode;
	readonly sourceFd: number;
	readonly targetFd: number | null;
	readonly append: boolean;
	readonly noclobber: boolean;
	readonly optional: boolean;
	readonly target: Word;

	constructor(
		span: SourceSpan,
		redirectKind: RedirectionKind,
		target: Word,
		options: {
			mode?: RedirectionMode;
			sourceFd?: number;
			targetFd?: number | null;
			append?: boolean;
			noclobber?: boolean;
			optional?: boolean;
		} = {}
	) {
		super(span);
		this.redirectKind = redirectKind;
		this.target = target;
		this.mode = options.mode ?? 'file';
		this.sourceFd = options.sourceFd ?? (redirectKind === 'input' ? 0 : 1);
		this.targetFd = options.targetFd ?? null;
		this.append = options.append ?? false;
		this.noclobber = options.noclobber ?? false;
		this.optional = options.optional ?? false;
	}

	accept<T>(visitor: Visitor<T>): T {
		return visitor.visitRedirection(this);
	}
}
