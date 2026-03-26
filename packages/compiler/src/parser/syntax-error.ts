/**
 * Syntax error exception for the Fish subset parser.
 *
 * Includes position information for error reporting.
 */

import { createParserDiagnostic, type ShellDiagnostic } from '../diagnostic';
import type { SourceSpan } from '../lexer/position';

/**
 * Exception thrown when a syntax error is encountered during parsing.
 */
export class ParseSyntaxError extends Error {
	readonly diagnostic: ShellDiagnostic;
	/** The source span where the error occurred */
	readonly span: SourceSpan;
	/** Additional context about the error */
	readonly context?: string;

	constructor(
		message: string,
		span: SourceSpan,
		options: {
			code?: string;
			context?: string;
		} = {}
	) {
		super(ParseSyntaxError.formatMessage(message, span, options.context));
		this.name = 'ParseSyntaxError';
		this.diagnostic = createParserDiagnostic(message, span, {
			code: options.code,
		});
		this.span = span;
		this.context = options.context;

		// Maintain proper stack trace in V8 environments
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ParseSyntaxError);
		}
	}

	/**
	 * Format an error message with position information.
	 */
	private static formatMessage(
		message: string,
		span: SourceSpan,
		context?: string
	): string {
		const location = `${span.start.line}:${span.start.column}`;
		const base = `Syntax error at ${location}: ${message}`;
		return context ? `${base} (${context})` : base;
	}

	/**
	 * Get the line number where the error occurred.
	 */
	get line(): number {
		return this.span.start.line;
	}

	/**
	 * Get the column number where the error occurred.
	 */
	get column(): number {
		return this.span.start.column;
	}
}

/**
 * Exception thrown when the parser encounters an unexpected end of input.
 */
export class UnexpectedEOFError extends ParseSyntaxError {
	constructor(expected: string, span: SourceSpan) {
		super(`Unexpected end of input, expected ${expected}`, span, {
			code: 'unexpected-eof',
		});
		this.name = 'UnexpectedEOFError';
	}
}

/**
 * Exception thrown when the parser encounters an unexpected token.
 */
export class UnexpectedTokenError extends ParseSyntaxError {
	readonly found: string;
	readonly expected: string;

	constructor(found: string, expected: string, span: SourceSpan) {
		super(`Unexpected token '${found}', expected ${expected}`, span, {
			code: 'unexpected-token',
		});
		this.name = 'UnexpectedTokenError';
		this.found = found;
		this.expected = expected;
	}
}

/**
 * Exception thrown when parentheses are unmatched.
 */
export class UnmatchedParenError extends ParseSyntaxError {
	constructor(span: SourceSpan) {
		super('Unmatched parenthesis', span, {
			code: 'unmatched-parenthesis',
		});
		this.name = 'UnmatchedParenError';
	}
}

/**
 * Exception thrown when quotes are unterminated.
 */
export class UnterminatedQuoteError extends ParseSyntaxError {
	readonly quoteChar: string;

	constructor(quoteChar: string, span: SourceSpan) {
		super(
			`Unterminated ${quoteChar === '"' ? 'double' : 'single'} quote`,
			span,
			{
				code: 'unterminated-quote',
			}
		);
		this.name = 'UnterminatedQuoteError';
		this.quoteChar = quoteChar;
	}
}
