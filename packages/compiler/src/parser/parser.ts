/**
 * Main parser for the Fish subset language.
 *
 * This is a modular, recursive descent (LL-style) parser inspired by
 * the VC Parser architecture. It uses single-token lookahead (LL(1))
 * and streams tokens from the lexer.
 *
 * The parser delegates to sub-parsers:
 * - StatementParser: pipelines
 * - CommandParser: simple commands
 * - WordParser: words and expansions
 *
 * Fish subset features supported:
 * - Pipelines (|)
 * - Multi-statement scripts (newline and ;)
 * - Command substitution (...)
 * - Globbing (* ? [...])
 * - Redirections (< >) - Phase 2
 * - Comments (#)
 *
 * NOT supported:
 * - Variables ($var)
 * - Control flow (if, for, while, etc.)
 * - Functions
 * - Brace expansion
 * - Background jobs (&)
 */

import { Effect } from 'effect';
import { type SourcePosition, SourceSpan } from '../lexer/position';
import { Scanner } from '../lexer/scanner';
import { Token, TokenKind } from '../lexer/token';
import type { Program } from './ast';
import { CommandParser } from './command';
import { ErrorReporter } from './error-reporter';
import { StatementParser } from './statement';
import {
	isParseSyntaxError,
	ParseSyntaxError,
	UnexpectedEOFError,
	UnexpectedTokenError,
} from './syntax-error';
import { WordParser } from './word';

/**
 * Main parser class for the Fish subset language.
 *
 * Usage:
 * ```typescript
 * const parser = new Parser('ls | grep foo');
 * const ast = parser.parse();
 * ```
 */
export class Parser {
	/** The scanner/lexer for tokenization */
	private readonly scanner: Scanner;
	/** Error reporter for collecting diagnostics */
	private readonly errorReporter: ErrorReporter;
	/** Current token being examined */
	private _currentToken: Token;
	/** Position of the previous token (for span tracking) */
	private _previousTokenPosition: SourcePosition;

	/** Sub-parsers */
	private readonly wordParser: WordParser;
	private readonly commandParser: CommandParser;
	private readonly statementParser: StatementParser;

	/** Recursion depth for command substitution */
	private readonly substitutionDepth: number;
	/** Maximum recursion depth */
	private static readonly MAX_SUBSTITUTION_DEPTH = 10;

	constructor(
		input: string | Scanner,
		errorReporter?: ErrorReporter,
		depth = 0
	) {
		this.scanner = typeof input === 'string' ? new Scanner(input) : input;
		this.errorReporter = errorReporter ?? new ErrorReporter();
		this.substitutionDepth = depth;

		// Initialize with first token
		this._currentToken = this.scanner.getToken();
		this._previousTokenPosition = this._currentToken.span.start;

		// Initialize sub-parsers with dependency injection
		this.wordParser = new WordParser(this);
		this.commandParser = new CommandParser(this, this.wordParser);
		this.statementParser = new StatementParser(this, this.commandParser);
	}

	// ─────────────────────────────────────────────────────────
	// Public API
	// ─────────────────────────────────────────────────────────

	/**
	 * Parse the input and return a Program AST.
	 * @throws SyntaxError if the input is invalid
	 */
	parse(): Program {
		return this.statementParser.parseScript();
	}

	/**
	 * Get the error reporter for accessing diagnostics.
	 */
	getErrorReporter(): ErrorReporter {
		return this.errorReporter;
	}

	// ─────────────────────────────────────────────────────────
	// Token Access (for sub-parsers)
	// ─────────────────────────────────────────────────────────

	/**
	 * Get the current token.
	 */
	get currentToken(): Token {
		return this._currentToken;
	}

	/**
	 * Get the position of the previous token.
	 */
	get previousTokenPosition(): SourcePosition {
		return this._previousTokenPosition;
	}

	// ─────────────────────────────────────────────────────────
	// Token Operations (VC Parser style)
	// ─────────────────────────────────────────────────────────

	/**
	 * Advance to the next token.
	 */
	advance(): void {
		this._previousTokenPosition = this._currentToken.span.end;
		this._currentToken = this.scanner.getToken();
	}

	/**
	 * Match the current token against an expected kind.
	 * Advances if matched, throws error if not.
	 *
	 * @param expected The expected token kind
	 * @throws SyntaxError if the current token doesn't match
	 */
	match(expected: TokenKind): void {
		if (this._currentToken.kind === expected) {
			this._previousTokenPosition = this._currentToken.span.end;
			this._currentToken = this.scanner.getToken();
			return;
		}
		this.syntacticError(
			`Expected ${Token.kindName(expected)}`,
			Token.kindName(expected)
		);
	}

	/**
	 * Accept a token if it matches the expected kind.
	 * Returns true and advances if matched, false otherwise.
	 *
	 * @param expected The expected token kind
	 * @returns true if the token was accepted
	 */
	accept(expected: TokenKind): boolean {
		if (this._currentToken.kind === expected) {
			this._previousTokenPosition = this._currentToken.span.end;
			this._currentToken = this.scanner.getToken();
			return true;
		}
		return false;
	}

	/**
	 * Check if the current token matches the expected kind.
	 * Does not advance.
	 *
	 * @param expected The expected token kind
	 * @returns true if the current token matches
	 */
	check(expected: TokenKind): boolean {
		return this._currentToken.kind === expected;
	}

	// ─────────────────────────────────────────────────────────
	// Position Tracking (VC Parser style)
	// ─────────────────────────────────────────────────────────

	/**
	 * Start tracking a span from the current token position.
	 */
	startSpan(): SourcePosition {
		return this._currentToken.span.start;
	}

	/**
	 * Finish a span at the previous token position.
	 */
	finishSpan(start: SourcePosition): SourceSpan {
		return new SourceSpan(start, this._previousTokenPosition);
	}

	// ─────────────────────────────────────────────────────────
	// Error Handling
	// ─────────────────────────────────────────────────────────

	/**
	 * Report a syntactic error and throw an exception.
	 *
	 * @param message Error message
	 * @param expected What was expected (for error context)
	 * @throws SyntaxError always
	 */
	syntacticError(_message: string, expected: string): never {
		const span = this._currentToken.span;

		if (this._currentToken.kind === TokenKind.EOF) {
			this.errorReporter.reportError(
				`Unexpected end of input, expected ${expected}`,
				span,
				'unexpected-eof'
			);
			throw new UnexpectedEOFError(expected, span);
		}

		const found =
			this._currentToken.spelling ||
			Token.kindName(this._currentToken.kind);
		this.errorReporter.reportError(
			`Unexpected token '${found}', expected ${expected}`,
			span,
			'unexpected-token'
		);
		throw new UnexpectedTokenError(found, expected, span);
	}

	/**
	 * Parse a command substitution (inner program).
	 * Called recursively when parsing (...) content.
	 *
	 * @param input The inner content of the command substitution
	 * @returns The parsed program
	 */
	parseSubstitution(input: string): Program {
		if (this.substitutionDepth >= Parser.MAX_SUBSTITUTION_DEPTH) {
			throw new ParseSyntaxError(
				'Maximum command substitution depth exceeded',
				this._currentToken.span,
				{
					code: 'max-substitution-depth',
				}
			);
		}

		const innerParser = new Parser(
			input,
			this.errorReporter,
			this.substitutionDepth + 1
		);

		return innerParser.parse();
	}
}

// ─────────────────────────────────────────────────────────
// Convenience function
// ─────────────────────────────────────────────────────────

/**
 * Parse a Fish subset input string and return the AST.
 *
 * @param input The input string to parse
 * @returns The parsed Program AST
 * @throws SyntaxError if the input is invalid
 */
export function parse(input: string): Program {
	const parser = new Parser(input);
	return parser.parse();
}

export const parseEffect: (
	input: string
) => Effect.Effect<Program, ParseSyntaxError> = Effect.fn('Parser.parse')(
	function* (input: string) {
		return yield* Effect.suspend(() => {
			try {
				return Effect.succeed(new Parser(input).parse());
			} catch (error) {
				if (isParseSyntaxError(error)) {
					return Effect.fail(error);
				}
				throw error;
			}
		});
	}
);
