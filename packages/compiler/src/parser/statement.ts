/**
 * Statement parser for the Fish subset parser.
 *
 * Handles parsing of:
 * - Script statements separated by newline or semicolon
 * - Statement chaining: `; and`/`; or` keywords and `&&`/`||` combiners
 * - Job negation with `not` and `!`
 * - Command-scoped variable assignments (`name=value command`)
 * - Blocks and control flow: begin, if, while, for, function
 * - break, continue, and return
 * - Pipelines (command | command | ...)
 */

import { SourceSpan } from '../lexer/position';
import { type Token, TokenKind } from '../lexer/token';
import {
	Assignment,
	BeginStatement,
	BreakStatement,
	ContinueStatement,
	ForStatement,
	FunctionStatement,
	type IfBranch,
	IfStatement,
	LiteralPart,
	Pipeline,
	Program,
	Redirection,
	ReturnStatement,
	SimpleCommand,
	Statement,
	type StatementChainMode,
	type StatementNode,
	WhileStatement,
	Word,
} from './ast';
import type { CommandParser } from './command';
import type { Parser } from './parser';
import { ParseSyntaxError } from './syntax-error';

const ASSIGNMENT_PREFIX_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const BLOCK_KEYWORDS = new Set([
	'begin',
	'if',
	'while',
	'for',
	'function',
] as const);

type BlockKeyword = 'begin' | 'if' | 'while' | 'for' | 'function';

/**
 * Parser for statements, blocks, and pipelines.
 *
 * A program is an ordered list of statement nodes. Symbolic combiners
 * (`&&`/`||`) compile to the same chain metadata as `; and`/`; or`.
 */
export class StatementParser {
	private readonly parser: Parser;
	private readonly commandParser: CommandParser;
	private loopDepth = 0;

	constructor(parser: Parser, commandParser: CommandParser) {
		this.parser = parser;
		this.commandParser = commandParser;
	}

	/**
	 * Parse a full script program.
	 */
	parseScript(): Program {
		const startPos = this.parser.currentToken.span.start;
		const statements = this.parseStatementSequence(new Set());

		if (this.parser.currentToken.kind !== TokenKind.EOF) {
			return this.parser.syntacticError(
				'Expected statement separator',
				'newline or ;'
			);
		}

		const endPos = this.parser.previousTokenPosition;
		return new Program(new SourceSpan(startPos, endPos), statements);
	}

	/**
	 * Parse statements until EOF or an unquoted stop keyword (not consumed).
	 */
	private parseStatementSequence(stops: Set<string>): StatementNode[] {
		const statements: StatementNode[] = [];

		this.consumeSeparatorsAndComments();
		while (this.parser.currentToken.kind !== TokenKind.EOF) {
			if (this.isStopKeyword(stops)) {
				break;
			}

			statements.push(
				...this.parseStatementChain(this.takeChainKeyword())
			);

			const sawSeparator = this.consumeSeparatorsAndComments();
			if (
				(this.parser.currentToken.kind as TokenKind) !==
					TokenKind.EOF &&
				!(sawSeparator || this.isStopKeyword(stops))
			) {
				return this.parser.syntacticError(
					'Expected statement separator',
					'newline or ;'
				);
			}
		}

		return statements;
	}

	/**
	 * Parse a job conjunction: `job (('&&' | '||') job)*`.
	 * Each combiner becomes chain metadata on the following statement.
	 */
	private parseStatementChain(
		initialChainMode: StatementChainMode
	): StatementNode[] {
		const statements: StatementNode[] = [];
		let chainMode = initialChainMode;

		while (true) {
			statements.push(this.parseJob(chainMode));

			const kind = this.parser.currentToken.kind;
			if (kind === TokenKind.AND_AND) {
				chainMode = 'and';
			} else if (kind === TokenKind.OR_OR) {
				chainMode = 'or';
			} else {
				break;
			}
			this.parser.advance();
			this.skipNewlinesAndComments();
		}

		return statements;
	}

	/**
	 * Parse a single job: assignments, negation, then a block statement,
	 * loop-control statement, or pipeline.
	 */
	private parseJob(chainMode: StatementChainMode): StatementNode {
		const startToken = this.parser.currentToken;
		const assignments = this.parseAssignments();

		let negated = false;
		while (this.isKeyword('not') || this.isKeyword('!')) {
			this.parser.advance();
			negated = !negated;
			assignments.push(...this.parseAssignments());
		}

		const blockKeyword = this.currentBlockKeyword();
		if (blockKeyword) {
			return this.parseBlockStatement(blockKeyword, {
				assignments,
				chainMode,
				negated,
			});
		}

		if (this.isKeyword('break') || this.isKeyword('continue')) {
			this.requireNoJobPrefixes(assignments, startToken);
			return this.parseLoopControl(chainMode);
		}

		if (this.isKeyword('return')) {
			this.requireNoJobPrefixes(assignments, startToken);
			return this.parseReturn(chainMode);
		}

		if (this.isKeyword('end') || this.isKeyword('else')) {
			return this.parser.syntacticError(
				`'${this.parser.currentToken.spelling}' outside of a block`,
				'command'
			);
		}

		const pipeline = this.parsePipeline(assignments);
		if (!pipeline) {
			if (assignments.length > 0) {
				throw this.unsupportedAssignmentError(assignments, startToken);
			}
			return this.parser.syntacticError('Expected command', 'command');
		}

		return new Statement(pipeline.span, pipeline, chainMode, negated);
	}

	// ─────────────────────────────────────────────────────────
	// Blocks and control flow
	// ─────────────────────────────────────────────────────────

	private parseBlockStatement(
		keyword: BlockKeyword,
		context: {
			assignments: Assignment[];
			chainMode: StatementChainMode;
			negated: boolean;
		}
	): StatementNode {
		switch (keyword) {
			case 'begin':
				return this.parseBegin(context);
			case 'if':
				return this.parseIf(context);
			case 'while':
				return this.parseWhile(context);
			case 'for':
				this.requireNoJobPrefixesForKeyword(context, 'for');
				return this.parseFor(context.chainMode);
			case 'function':
				this.requireNoJobPrefixesForKeyword(context, 'function');
				return this.parseFunction(context.chainMode);
			default: {
				const _exhaustive: never = keyword;
				return this.parser.syntacticError(
					`Unknown block keyword: ${_exhaustive}`,
					'block keyword'
				);
			}
		}
	}

	private parseBegin(context: {
		assignments: Assignment[];
		chainMode: StatementChainMode;
		negated: boolean;
	}): BeginStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // begin

		const body = this.parseStatementSequence(new Set(['end']));
		this.expectKeyword('end');

		return new BeginStatement(
			new SourceSpan(startPos, this.parser.previousTokenPosition),
			body,
			context.chainMode,
			context.negated,
			context.assignments
		);
	}

	private parseIf(context: {
		assignments: Assignment[];
		chainMode: StatementChainMode;
		negated: boolean;
	}): IfStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // if

		const branches: IfBranch[] = [];
		let elseBody: StatementNode[] | null = null;

		while (true) {
			const condition = this.parseConditionList();
			const body = this.parseStatementSequence(new Set(['else', 'end']));
			branches.push({ body, condition });

			if (!this.isKeyword('else')) {
				break;
			}
			this.parser.advance(); // else
			// `else if` must be on the same line; `else` followed by a
			// newline starts an else body (which may itself contain an if).
			if (this.isKeyword('if')) {
				this.parser.advance(); // if
				continue;
			}
			elseBody = this.parseStatementSequence(new Set(['end']));
			break;
		}

		this.expectKeyword('end');
		return new IfStatement(
			new SourceSpan(startPos, this.parser.previousTokenPosition),
			branches,
			elseBody,
			context.chainMode,
			context.negated,
			context.assignments
		);
	}

	private parseWhile(context: {
		assignments: Assignment[];
		chainMode: StatementChainMode;
		negated: boolean;
	}): WhileStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // while

		this.loopDepth++;
		try {
			const condition = this.parseConditionList();
			const body = this.parseStatementSequence(new Set(['end']));
			this.expectKeyword('end');

			return new WhileStatement(
				new SourceSpan(startPos, this.parser.previousTokenPosition),
				condition,
				body,
				context.chainMode,
				context.negated,
				context.assignments
			);
		} finally {
			this.loopDepth--;
		}
	}

	private parseFor(chainMode: StatementChainMode): ForStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // for

		const variableWord = this.commandParser.parseWordArgument();
		const variable = variableWord?.literalValue;
		if (!(variableWord && variable && VARIABLE_NAME_REGEX.test(variable))) {
			return this.parser.syntacticError(
				'for: invalid loop variable name',
				'variable name'
			);
		}

		if (!this.isKeyword('in')) {
			return this.parser.syntacticError(
				"Expected 'in' after the for loop variable",
				'in'
			);
		}
		this.parser.advance(); // in

		const values: Word[] = [];
		while (true) {
			const value = this.commandParser.parseWordArgument();
			if (!value) {
				break;
			}
			values.push(value);
		}

		this.loopDepth++;
		try {
			const body = this.parseStatementSequence(new Set(['end']));
			this.expectKeyword('end');

			return new ForStatement(
				new SourceSpan(startPos, this.parser.previousTokenPosition),
				variable,
				values,
				body,
				chainMode
			);
		} finally {
			this.loopDepth--;
		}
	}

	private parseFunction(chainMode: StatementChainMode): FunctionStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // function

		const nameWord = this.commandParser.parseWordArgument();
		const name = nameWord?.literalValue;
		if (!(nameWord && name) || name.startsWith('-')) {
			throw new ParseSyntaxError(
				`function: ${name ?? this.parser.currentToken.spelling}: invalid function name`,
				this.parser.currentToken.span,
				{ code: 'invalid-function-name' }
			);
		}

		const argumentNames = this.parseFunctionOptions();

		const outerLoopDepth = this.loopDepth;
		this.loopDepth = 0;
		try {
			const body = this.parseStatementSequence(new Set(['end']));
			this.expectKeyword('end');

			return new FunctionStatement(
				new SourceSpan(startPos, this.parser.previousTokenPosition),
				name,
				argumentNames,
				body,
				chainMode
			);
		} finally {
			this.loopDepth = outerLoopDepth;
		}
	}

	private parseFunctionOptions(): string[] {
		const argumentNames: string[] = [];
		let collectingArgumentNames = false;

		while (true) {
			const token = this.parser.currentToken;
			if (
				token.kind !== TokenKind.WORD &&
				token.kind !== TokenKind.NAME &&
				token.kind !== TokenKind.NUMBER
			) {
				break;
			}
			const word = this.commandParser.parseWordArgument();
			if (!word) {
				break;
			}
			const literal = word.literalValue ?? '';
			if (
				literal === '-a' ||
				literal === '--argument-names' ||
				literal === '--argument'
			) {
				collectingArgumentNames = true;
				continue;
			}
			if (literal === '-d' || literal === '--description') {
				this.commandParser.parseWordArgument();
				continue;
			}
			if (literal.startsWith('-')) {
				throw new ParseSyntaxError(
					`function: ${literal}: unknown option`,
					word.span,
					{ code: 'invalid-function-option' }
				);
			}
			if (!collectingArgumentNames) {
				throw new ParseSyntaxError(
					`function: ${literal}: unexpected positional argument`,
					word.span,
					{ code: 'invalid-function-option' }
				);
			}
			this.validateArgumentName(literal, word.span);
			argumentNames.push(literal);
		}

		return argumentNames;
	}

	private validateArgumentName(literal: string, span: SourceSpan): void {
		if (!VARIABLE_NAME_REGEX.test(literal)) {
			throw new ParseSyntaxError(
				`function: ${literal}: invalid argument name`,
				span,
				{ code: 'invalid-function-option' }
			);
		}
		if (literal === 'status') {
			// Fish rejects read-only names as named arguments while
			// allowing argv (tests/checks/function.fish).
			throw new ParseSyntaxError(
				"function: variable 'status' is read-only",
				span,
				{ code: 'invalid-function-option' }
			);
		}
	}

	private parseLoopControl(
		chainMode: StatementChainMode
	): BreakStatement | ContinueStatement {
		const token = this.parser.currentToken;
		const keyword = token.spelling;
		if (this.loopDepth === 0) {
			throw new ParseSyntaxError(
				`${keyword}: Not inside of loop`,
				token.span,
				{ code: 'loop-control-outside-loop' }
			);
		}
		this.parser.advance();

		if (this.isWordToken(this.parser.currentToken)) {
			throw new ParseSyntaxError(
				`${keyword}: too many arguments`,
				this.parser.currentToken.span,
				{ code: 'loop-control-arguments' }
			);
		}

		return keyword === 'break'
			? new BreakStatement(token.span, chainMode)
			: new ContinueStatement(token.span, chainMode);
	}

	private parseReturn(chainMode: StatementChainMode): ReturnStatement {
		const startPos = this.parser.currentToken.span.start;
		this.parser.advance(); // return

		const values: Word[] = [];
		while (true) {
			const value = this.commandParser.parseWordArgument();
			if (!value) {
				break;
			}
			values.push(value);
		}

		return new ReturnStatement(
			new SourceSpan(startPos, this.parser.previousTokenPosition),
			values,
			chainMode
		);
	}

	/**
	 * Parse an if/while condition: a statement chain plus any following
	 * statements that begin with the `and`/`or` keywords.
	 */
	private parseConditionList(): StatementNode[] {
		const condition = this.parseStatementChain(this.takeChainKeyword());

		while (true) {
			this.consumeSeparatorsAndComments();
			if (!(this.isKeyword('and') || this.isKeyword('or'))) {
				break;
			}
			condition.push(
				...this.parseStatementChain(this.takeChainKeyword())
			);
		}

		return condition;
	}

	// ─────────────────────────────────────────────────────────
	// Pipelines
	// ─────────────────────────────────────────────────────────

	/**
	 * Parse a pipeline.
	 *
	 * Grammar:
	 *   pipeline ::= command ('|' command)*
	 */
	parsePipeline(initialAssignments: Assignment[] = []): Pipeline | null {
		const startPos = this.parser.currentToken.span.start;

		// Parse first command
		const firstCommand =
			this.commandParser.parseCommand(initialAssignments);
		if (!firstCommand) {
			return null;
		}

		const commands: SimpleCommand[] = [firstCommand];

		// Parse remaining commands in pipeline
		while (this.parser.currentToken.kind === TokenKind.PIPE) {
			const pipeToken = this.parser.currentToken;
			const previousCommand = commands.at(-1);
			if (previousCommand) {
				const rewrittenPreviousCommand = this.rewriteStderrPipeCommand(
					previousCommand,
					pipeToken.span.start.offset,
					pipeToken.span
				);
				if (rewrittenPreviousCommand !== previousCommand) {
					commands[commands.length - 1] = rewrittenPreviousCommand;
				}
			}
			this.parser.advance(); // consume |

			// Skip any newlines after pipe (line continuation)
			this.skipNewlines();
			const tokenAfterPipe = this.parser.currentToken;
			if (
				tokenAfterPipe.kind === TokenKind.WORD &&
				tokenAfterPipe.spelling === '&'
			) {
				return this.parser.syntacticError(
					'Invalid fish pipeline operator',
					'command after | (|& is unsupported; use &|)'
				);
			}
			if (
				!tokenAfterPipe.isQuoted &&
				(tokenAfterPipe.spelling === 'and' ||
					tokenAfterPipe.spelling === 'or' ||
					tokenAfterPipe.spelling === 'not')
			) {
				throw new ParseSyntaxError(
					`The '${tokenAfterPipe.spelling}' command can not be used in a pipeline`,
					tokenAfterPipe.span,
					{ code: 'keyword-in-pipeline' }
				);
			}

			const pipeAssignments = this.parseAssignments();
			const command = this.commandParser.parseCommand(pipeAssignments);
			if (!command) {
				if (pipeAssignments.length > 0) {
					throw this.unsupportedAssignmentError(
						pipeAssignments,
						tokenAfterPipe
					);
				}
				return this.parser.syntacticError(
					'Expected command after |',
					'command'
				);
			}

			commands.push(command);
		}

		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);

		return new Pipeline(span, commands);
	}

	// ─────────────────────────────────────────────────────────
	// Assignments
	// ─────────────────────────────────────────────────────────

	/**
	 * Parse zero or more `name=value` assignment prefixes.
	 */
	private parseAssignments(): Assignment[] {
		const assignments: Assignment[] = [];
		while (true) {
			const assignment = this.parseAssignment();
			if (!assignment) {
				return assignments;
			}
			assignments.push(assignment);
		}
	}

	private parseAssignment(): Assignment | null {
		const token = this.parser.currentToken;
		if (!this.isAssignmentToken(token)) {
			return null;
		}

		const firstPart = token.wordParts[0];
		if (firstPart?.kind !== 'literal') {
			return null;
		}
		const match = ASSIGNMENT_PREFIX_REGEX.exec(firstPart.text);
		if (!match?.[1]) {
			return null;
		}
		const name = match[1];

		const word = this.commandParser.parseWordArgument();
		if (!word) {
			return null;
		}

		const remainder = firstPart.text.slice(name.length + 1);
		const valueParts = [...word.parts];
		// The first parsed part mirrors the token's first literal part;
		// replace it with the text after `name=`.
		valueParts.shift();
		if (remainder !== '') {
			valueParts.unshift(new LiteralPart(firstPart.span, remainder));
		}
		if (valueParts.length === 0) {
			valueParts.push(new LiteralPart(firstPart.span, ''));
		}

		return new Assignment(
			word.span,
			name,
			new Word(word.span, valueParts, word.quoted)
		);
	}

	private isAssignmentToken(token: Token): boolean {
		if (!this.isWordToken(token)) {
			return false;
		}
		const firstPart = token.wordParts[0];
		return (
			firstPart?.kind === 'literal' &&
			firstPart.quote === 'none' &&
			!firstPart.escaped &&
			ASSIGNMENT_PREFIX_REGEX.test(firstPart.text)
		);
	}

	private unsupportedAssignmentError(
		assignments: Assignment[],
		token: Token
	): ParseSyntaxError {
		const first = assignments[0];
		const name = first?.name ?? 'VAR';
		const value = first?.value.literalValue ?? 'VALUE';
		return new ParseSyntaxError(
			`Unsupported use of '='. In fish, please use 'set ${name} ${value}'.`,
			token.span,
			{ code: 'bare-assignment' }
		);
	}

	private requireNoJobPrefixes(
		assignments: Assignment[],
		token: Token
	): void {
		if (assignments.length > 0) {
			throw this.unsupportedAssignmentError(assignments, token);
		}
	}

	private requireNoJobPrefixesForKeyword(
		context: { assignments: Assignment[]; negated: boolean },
		keyword: string
	): void {
		if (context.assignments.length > 0) {
			throw this.unsupportedAssignmentError(
				context.assignments,
				this.parser.currentToken
			);
		}
		if (context.negated) {
			this.parser.syntacticError(
				`'not' cannot be used before '${keyword}'`,
				'command'
			);
		}
	}

	// ─────────────────────────────────────────────────────────
	// Token helpers
	// ─────────────────────────────────────────────────────────

	/**
	 * Consume a leading `and`/`or` chain keyword if present.
	 */
	private takeChainKeyword(): StatementChainMode {
		const currentToken = this.parser.currentToken;
		if (
			!currentToken.isQuoted &&
			this.isChainKeyword(currentToken.spelling)
		) {
			const chainMode = currentToken.spelling === 'and' ? 'and' : 'or';
			this.parser.advance();
			return chainMode;
		}
		return 'always';
	}

	private currentBlockKeyword(): BlockKeyword | null {
		const token = this.parser.currentToken;
		if (token.isQuoted || !this.isWordToken(token)) {
			return null;
		}
		return BLOCK_KEYWORDS.has(token.spelling as BlockKeyword)
			? (token.spelling as BlockKeyword)
			: null;
	}

	private isKeyword(keyword: string): boolean {
		const token = this.parser.currentToken;
		return (
			!token.isQuoted &&
			this.isWordToken(token) &&
			token.spelling === keyword
		);
	}

	private isStopKeyword(stops: Set<string>): boolean {
		const token = this.parser.currentToken;
		return (
			!token.isQuoted &&
			this.isWordToken(token) &&
			stops.has(token.spelling)
		);
	}

	private expectKeyword(keyword: string): void {
		if (!this.isKeyword(keyword)) {
			this.parser.syntacticError(
				`Expected '${keyword}' to close the block`,
				keyword
			);
		}
		this.parser.advance();
	}

	private isWordToken(token: Token): boolean {
		return (
			token.kind === TokenKind.WORD ||
			token.kind === TokenKind.NAME ||
			token.kind === TokenKind.NUMBER
		);
	}

	/**
	 * Skip newline tokens (for line continuation after pipe).
	 */
	private skipNewlines(): void {
		while (this.parser.currentToken.kind === TokenKind.NEWLINE) {
			this.parser.advance();
		}
	}

	/**
	 * Skip newline and comment tokens (for continuation after && and ||).
	 */
	private skipNewlinesAndComments(): void {
		while (
			this.parser.currentToken.kind === TokenKind.NEWLINE ||
			this.parser.currentToken.kind === TokenKind.COMMENT
		) {
			this.parser.advance();
		}
	}

	/**
	 * Consume separators and comments between statements.
	 *
	 * @returns true if at least one statement separator was consumed.
	 */
	private consumeSeparatorsAndComments(): boolean {
		let sawSeparator = false;
		while (true) {
			const tokenKind = this.parser.currentToken.kind;
			if (tokenKind === TokenKind.COMMENT) {
				this.parser.advance();
				continue;
			}
			if (
				tokenKind === TokenKind.NEWLINE ||
				tokenKind === TokenKind.SEMICOLON
			) {
				sawSeparator = true;
				this.parser.advance();
				continue;
			}
			return sawSeparator;
		}
	}

	private isChainKeyword(spelling: string): spelling is 'and' | 'or' {
		return spelling === 'and' || spelling === 'or';
	}

	private rewriteStderrPipeCommand(
		command: SimpleCommand,
		pipeStartOffset: number,
		pipeSpan: SourceSpan
	): SimpleCommand {
		const trailingArg = command.args.at(-1);
		if (
			!(
				trailingArg &&
				!trailingArg.quoted &&
				trailingArg.literalValue === '&' &&
				trailingArg.span.end.offset === pipeStartOffset
			)
		) {
			return command;
		}

		const updatedArgs = command.args.slice(0, -1);
		const pipeTarget = this.createLiteralWord('|', pipeSpan);
		const updatedRedirections = [
			...command.redirections,
			new Redirection(pipeSpan, 'output', pipeTarget, {
				mode: 'pipe',
				sourceFd: 1,
			}),
			new Redirection(pipeSpan, 'output', pipeTarget, {
				mode: 'pipe',
				sourceFd: 2,
			}),
		];
		return new SimpleCommand(
			command.span,
			command.name,
			updatedArgs,
			updatedRedirections,
			command.assignments
		);
	}

	private createLiteralWord(literal: string, span: SourceSpan): Word {
		return new Word(span, [new LiteralPart(span, literal)]);
	}
}
