import { LexerState, StateContext } from './context';
import { OPERATORS, SINGLE_CHAR_OPS, WORD_BOUNDARY_CHARS } from './operators';
import type { SourcePosition } from './position';
import { type SourceReader, StringSourceReader } from './source-reader';
import {
	createEmptyFlags,
	Token,
	type TokenFlagsObject,
	TokenKind,
} from './token';

// Pre-compiled regex patterns for performance
const NUMBER_PATTERN = /^[0-9]+$/;
const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Result of processing a character in a complex word.
 */
interface CharProcessResult {
	chars: string;
	flags: TokenFlagsObject;
	done: boolean;
}

/**
 * Merge two flags objects, combining their values.
 */
function mergeFlags(
	a: TokenFlagsObject,
	b: TokenFlagsObject
): TokenFlagsObject {
	return {
		quoted: a.quoted || b.quoted,
		singleQuoted: a.singleQuoted || b.singleQuoted,
		doubleQuoted: a.doubleQuoted || b.doubleQuoted,
		containsExpansion: a.containsExpansion || b.containsExpansion,
		containsGlob: a.containsGlob || b.containsGlob,
	};
}

/**
 * The main Scanner class for tokenizing fish subset source code.
 *
 * This lexer implements a fish-inspired subset with:
 * - Pipelines (|)
 * - Command substitution (...)
 * - Globbing (* ? [...])
 * - Single quotes (literal, no escapes)
 * - Double quotes (command substitution allowed, minimal escaping)
 * - Comments (#)
 * - Redirection (> <) - Phase 2
 *
 * NOT supported:
 * - Variables ($var)
 * - Brace expansion ({a,b})
 * - Control flow (if, for, while, etc.)
 * - Functions
 * - Background (&)
 * - Semicolons (;)
 * - and/or/not keywords
 * - Tilde expansion (~)
 * - Recursive globbing (**)
 */
export class Scanner {
	private readonly source: SourceReader;
	private readonly stateCtx = new StateContext();
	private debug = false;

	constructor(input: string | SourceReader) {
		this.source =
			typeof input === 'string' ? new StringSourceReader(input) : input;
	}

	/**
	 * Enable debug logging of tokens.
	 */
	enableDebugging(): this {
		this.debug = true;
		return this;
	}

	/**
	 * Main entry: get next token.
	 */
	getToken(): Token {
		this.skipWhitespace();

		const start = this.source.position;
		const token = this.nextToken(start);

		if (this.debug) {
			console.log(token.toString());
		}

		return token;
	}

	/**
	 * Tokenize all input.
	 */
	tokenize(): Token[] {
		const tokens: Token[] = [];
		let token: Token;
		do {
			token = this.getToken();
			tokens.push(token);
		} while (token.kind !== TokenKind.EOF);
		return tokens;
	}

	// ─────────────────────────────────────────────────────────
	// Core scanning logic
	// ─────────────────────────────────────────────────────────

	private nextToken(start: SourcePosition): Token {
		const c0 = this.source.peek();

		// EOF
		if (this.source.eof || c0 === '\0') {
			return this.makeToken(TokenKind.EOF, '', start);
		}

		// Comment - only at token start
		if (c0 === '#') {
			return this.readComment(start);
		}

		// Newline
		if (c0 === '\n') {
			this.source.advance();
			return this.makeToken(TokenKind.NEWLINE, '\n', start);
		}

		// Multi-char operators (longest match first)
		const opToken = this.tryMatchOperator(start);
		if (opToken) {
			return opToken;
		}

		// Single-char operators
		const singleOp = SINGLE_CHAR_OPS.get(c0);
		if (singleOp !== undefined) {
			this.source.advance();
			return this.makeToken(singleOp, c0, start);
		}

		// Parentheses - command substitution
		if (c0 === '(') {
			this.source.advance();
			return this.makeToken(TokenKind.LPAREN, '(', start);
		}

		if (c0 === ')') {
			this.source.advance();
			return this.makeToken(TokenKind.RPAREN, ')', start);
		}

		// Word (handles quotes, escapes, globs, etc.)
		return this.readWord(start);
	}

	private tryMatchOperator(start: SourcePosition): Token | null {
		// Build lookahead string (max 2 chars)
		const chars = this.source.peek() + this.source.peek(1);

		for (const op of OPERATORS) {
			if (chars.startsWith(op.pattern)) {
				// Consume the operator
				for (const _ of op.pattern) {
					this.source.advance();
				}
				return this.makeToken(op.kind, op.pattern, start);
			}
		}

		return null;
	}

	// ─────────────────────────────────────────────────────────
	// Word reading (fast path + slow path)
	// ─────────────────────────────────────────────────────────

	private readWord(start: SourcePosition): Token {
		// FAST PATH: Simple word with no special characters
		const fastResult = this.tryFastPath(start);
		if (fastResult) {
			return fastResult;
		}

		// SLOW PATH: Complex word with quotes, escapes, expansions
		return this.readComplexWord(start);
	}

	private tryFastPath(start: SourcePosition): Token | null {
		this.source.mark();
		let spelling = '';

		while (!this.source.eof) {
			const c = this.source.peek();

			// Break on any special character
			if (this.isSpecialChar(c)) {
				break;
			}

			spelling += this.source.advance();
		}

		if (spelling.length === 0) {
			this.source.reset();
			return null;
		}

		// Check if we hit a simple delimiter (fast path success)
		const next = this.source.peek();
		if (this.isWordBoundary(next)) {
			return this.classifyWord(spelling, start, createEmptyFlags());
		}

		// Hit a special char that needs slow path processing
		this.source.reset();
		return null;
	}

	private readComplexWord(start: SourcePosition): Token {
		this.stateCtx.reset();
		let spelling = '';
		let flags = createEmptyFlags();

		while (!this.source.eof) {
			const c = this.source.peek();

			// Word boundaries (when not in quotes)
			if (!this.stateCtx.inQuotes && this.isWordBoundary(c)) {
				break;
			}

			// Handle based on current context
			const result = this.processChar(c);
			spelling += result.chars;
			flags = mergeFlags(flags, result.flags);

			if (result.done) {
				break;
			}
		}

		return this.classifyWord(spelling, start, flags);
	}

	private processChar(c: string): CharProcessResult {
		// Single quote - no expansions inside (literal)
		if (c === "'" && !this.stateCtx.inDoubleQuote) {
			return this.handleSingleQuote();
		}

		// Double quote - command substitution allowed inside
		if (c === '"' && !this.stateCtx.inSingleQuote) {
			return this.handleDoubleQuote();
		}

		// Escape character - only in double quotes or unquoted
		if (c === '\\' && !this.stateCtx.inSingleQuote) {
			return this.handleEscape();
		}

		// Command substitution: (...) - only outside single quotes
		if (c === '(' && !this.stateCtx.inSingleQuote) {
			return this.readCommandSubstitution();
		}

		// Glob characters: * ?
		if ((c === '*' || c === '?') && !this.stateCtx.inQuotes) {
			return this.handleGlobChar(c);
		}

		// Character class: [...]
		if (c === '[' && !this.stateCtx.inQuotes) {
			return this.readCharacterClass();
		}

		// Regular character
		this.source.advance();
		return { chars: c, flags: createEmptyFlags(), done: false };
	}

	private handleGlobChar(c: string): CharProcessResult {
		this.source.advance();
		const flags = createEmptyFlags();
		flags.containsGlob = true;
		// Note: ** (recursive glob) is NOT supported in the subset
		// We just treat consecutive * as two separate globs
		return { chars: c, flags, done: false };
	}

	// ─────────────────────────────────────────────────────────
	// Quote handlers
	// ─────────────────────────────────────────────────────────

	private handleSingleQuote(): CharProcessResult {
		if (this.stateCtx.inSingleQuote) {
			// Closing quote
			this.stateCtx.pop();
			this.source.advance();
			return { chars: '', flags: createEmptyFlags(), done: false };
		}

		// Opening quote
		this.stateCtx.push(LexerState.SINGLE_QUOTED);
		this.source.advance();
		const flags = createEmptyFlags();
		flags.singleQuoted = true;
		flags.quoted = true;
		return { chars: '', flags, done: false };
	}

	private handleDoubleQuote(): CharProcessResult {
		if (this.stateCtx.inDoubleQuote) {
			// Closing quote
			this.stateCtx.pop();
			this.source.advance();
			return { chars: '', flags: createEmptyFlags(), done: false };
		}

		// Opening quote
		this.stateCtx.push(LexerState.DOUBLE_QUOTED);
		this.source.advance();
		const flags = createEmptyFlags();
		flags.doubleQuoted = true;
		flags.quoted = true;
		return { chars: '', flags, done: false };
	}

	private handleEscape(): CharProcessResult {
		this.source.advance(); // consume backslash
		const next = this.source.peek();

		if (this.source.eof || next === '\0') {
			// Trailing backslash
			return { chars: '\\', flags: createEmptyFlags(), done: false };
		}

		// Line continuation
		if (next === '\n') {
			this.source.advance();
			return { chars: '', flags: createEmptyFlags(), done: false };
		}

		// In double quotes, only \" and \\ are special (minimal escaping per spec)
		if (this.stateCtx.inDoubleQuote) {
			if ('"\\'.includes(next)) {
				this.source.advance();
				return {
					chars: next,
					flags: createEmptyFlags(),
					done: false,
				};
			}
			// Backslash is literal before other chars in double quotes
			return { chars: '\\', flags: createEmptyFlags(), done: false };
		}

		// Outside quotes, backslash escapes any character (removes special meaning)
		this.source.advance();
		return {
			chars: next,
			flags: createEmptyFlags(),
			done: false,
		};
	}

	// ─────────────────────────────────────────────────────────
	// Command substitution handler
	// ─────────────────────────────────────────────────────────

	private readCommandSubstitution(): CharProcessResult {
		let result = '';
		result += this.source.advance(); // (

		let depth = 1;
		while (depth > 0 && !this.source.eof) {
			const c = this.source.peek();

			if (c === '(') {
				depth++;
				result += this.source.advance();
			} else if (c === ')') {
				depth--;
				result += this.source.advance();
			} else if (c === "'" || c === '"') {
				// Skip quoted content
				result += this.skipQuotedContent(c);
			} else if (c === '\\' && !this.source.eof) {
				result += this.source.advance();
				if (!this.source.eof) {
					result += this.source.advance();
				}
			} else {
				result += this.source.advance();
			}
		}

		const flags = createEmptyFlags();
		flags.containsExpansion = true;
		return { chars: result, flags, done: false };
	}

	private readCharacterClass(): CharProcessResult {
		let result = '';
		result += this.source.advance(); // [

		// Check for negation
		if (this.source.peek() === '!' || this.source.peek() === '^') {
			result += this.source.advance();
		}

		// First char after [ or [! can be ]
		if (this.source.peek() === ']') {
			result += this.source.advance();
		}

		// Read until closing ]
		while (!this.source.eof && this.source.peek() !== ']') {
			result += this.source.advance();
		}

		if (this.source.peek() === ']') {
			result += this.source.advance();
		}

		const flags = createEmptyFlags();
		flags.containsGlob = true;
		return { chars: result, flags, done: false };
	}

	private skipQuotedContent(quoteChar: string): string {
		let result = '';
		result += this.source.advance(); // opening quote

		while (!this.source.eof && this.source.peek() !== quoteChar) {
			const c = this.source.peek();
			result += this.source.advance();
			if (c === '\\' && quoteChar === '"' && !this.source.eof) {
				result += this.source.advance();
			}
		}

		if (this.source.peek() === quoteChar) {
			result += this.source.advance();
		}

		return result;
	}

	// ─────────────────────────────────────────────────────────
	// Word classification
	// ─────────────────────────────────────────────────────────

	private classifyWord(
		spelling: string,
		start: SourcePosition,
		flags: TokenFlagsObject
	): Token {
		// No keywords in the subset - commands are just words

		// Number
		if (NUMBER_PATTERN.test(spelling)) {
			return this.makeToken(TokenKind.NUMBER, spelling, start, flags);
		}

		// Valid name/identifier
		if (NAME_PATTERN.test(spelling)) {
			return this.makeToken(TokenKind.NAME, spelling, start, flags);
		}

		return this.makeToken(TokenKind.WORD, spelling, start, flags);
	}

	// ─────────────────────────────────────────────────────────
	// Helpers
	// ─────────────────────────────────────────────────────────

	private skipWhitespace(): void {
		while (!this.source.eof) {
			const c = this.source.peek();
			if (c === ' ' || c === '\t') {
				this.source.advance();
			} else if (c === '\\' && this.source.peek(1) === '\n') {
				// Line continuation
				this.source.advance();
				this.source.advance();
			} else {
				break;
			}
		}
	}

	private readComment(start: SourcePosition): Token {
		let spelling = '';
		while (!this.source.eof && this.source.peek() !== '\n') {
			spelling += this.source.advance();
		}
		return this.makeToken(TokenKind.COMMENT, spelling, start);
	}

	private isSpecialChar(c: string): boolean {
		// Simplified for fish subset - no $, {, }, ~
		return ' \t\n|<>()"\'\\*?[#'.includes(c);
	}

	private isWordBoundary(c: string): boolean {
		return WORD_BOUNDARY_CHARS.has(c) || c === '\0';
	}

	private makeToken(
		kind: TokenKind,
		spelling: string,
		start: SourcePosition,
		flags: TokenFlagsObject = createEmptyFlags()
	): Token {
		return new Token(
			kind,
			spelling,
			start.span(this.source.position),
			flags
		);
	}
}
