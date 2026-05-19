import { LexerState, StateContext } from './context';
import { type SourcePosition, SourceSpan } from './position';
import { type SourceReader, StringSourceReader } from './source-reader';
import {
	createEmptyFlags,
	Token,
	type TokenFlagsObject,
	TokenKind,
	type TokenWordPart,
	type TokenWordPartQuote,
} from './token';

function isDigitCode(code: number): boolean {
	return code >= 48 && code <= 57;
}

function isNameStartCode(code: number): boolean {
	return (
		(code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
	);
}

function isNameContinueCode(code: number): boolean {
	return isNameStartCode(code) || isDigitCode(code) || code === 45;
}

function classifySpellingKind(spelling: string): TokenKind {
	if (spelling.length === 0) {
		return TokenKind.WORD;
	}

	let allDigits = true;
	for (let i = 0; i < spelling.length; i++) {
		if (!isDigitCode(spelling.charCodeAt(i))) {
			allDigits = false;
			break;
		}
	}
	if (allDigits) {
		return TokenKind.NUMBER;
	}

	if (!isNameStartCode(spelling.charCodeAt(0))) {
		return TokenKind.WORD;
	}
	for (let i = 1; i < spelling.length; i++) {
		if (!isNameContinueCode(spelling.charCodeAt(i))) {
			return TokenKind.WORD;
		}
	}
	return TokenKind.NAME;
}

function singleCharOperatorKind(c: string): TokenKind | null {
	switch (c) {
		case '|':
			return TokenKind.PIPE;
		case ';':
			return TokenKind.SEMICOLON;
		case '<':
			return TokenKind.LESS;
		case '>':
			return TokenKind.GREAT;
		default:
			return null;
	}
}

function isSpecialChar(c: string): boolean {
	switch (c) {
		case ' ':
		case '\t':
		case '\n':
		case '|':
		case ';':
		case '<':
		case '>':
		case '(':
		case ')':
		case '"':
		case "'":
		case '\\':
		case '*':
		case '?':
		case '[':
		case '#':
			return true;
		default:
			return false;
	}
}

function isWordBoundaryChar(c: string): boolean {
	switch (c) {
		case ' ':
		case '\t':
		case '\n':
		case '|':
		case ';':
		case '<':
		case '>':
		case ')':
		case '\0':
			return true;
		default:
			return false;
	}
}

/**
 * Result of processing a character in a complex word.
 */
interface CharProcessResult {
	chars: string;
	flags: TokenFlagsObject;
	done: boolean;
	part: TokenWordPart | null;
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

		// Single-char operators
		const singleOp = singleCharOperatorKind(c0);
		if (singleOp !== null) {
			this.source.advance();
			return this.makeToken(singleOp, c0, start);
		}

		// Command substitution can start a word with "(".
		if (c0 === '(') {
			return this.readWord(start);
		}

		if (c0 === ')') {
			this.source.advance();
			return this.makeToken(TokenKind.RPAREN, ')', start);
		}

		// Word (handles quotes, escapes, globs, etc.)
		return this.readWord(start);
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
		if (this.source instanceof StringSourceReader) {
			const spelling = this.source.readSimpleWord();
			if (spelling.length === 0) {
				return null;
			}

			// Check if we hit a simple delimiter (fast path success)
			const next = this.source.peek();
			if (this.isWordBoundary(next)) {
				return this.classifyWord(
					spelling,
					start,
					createEmptyFlags(),
					[]
				);
			}

			// Hit a special char that needs slow path processing
			this.source.rewindTo(start);
			return null;
		}

		this.source.mark();
		const spelling = this.readFastPathSpelling();

		if (spelling.length === 0) {
			this.source.reset();
			return null;
		}

		// Check if we hit a simple delimiter (fast path success)
		const next = this.source.peek();
		if (this.isWordBoundary(next)) {
			return this.classifyWord(spelling, start, createEmptyFlags(), []);
		}

		// Hit a special char that needs slow path processing
		this.source.reset();
		return null;
	}

	private readFastPathSpelling(): string {
		let spelling = '';
		while (!this.source.eof) {
			const c = this.source.peek();

			// Break on any special character
			if (this.isSpecialChar(c)) {
				break;
			}

			spelling += this.source.advance();
		}
		return spelling;
	}

	private readComplexWord(start: SourcePosition): Token {
		this.stateCtx.reset();
		let spelling = '';
		let flags = createEmptyFlags();
		const wordParts: TokenWordPart[] = [];

		while (!this.source.eof) {
			const c = this.source.peek();

			// Word boundaries (when not in quotes). "(" can start command substitution.
			if (
				!this.stateCtx.inQuotes &&
				this.isWordBoundary(c) &&
				c !== '('
			) {
				break;
			}

			// Handle based on current context
			const result = this.processChar(c, this.source.position);
			spelling += result.chars;
			flags = mergeFlags(flags, result.flags);
			if (result.part) {
				this.appendWordPart(wordParts, result.part);
			}

			if (result.done) {
				break;
			}
		}

		return this.classifyWord(spelling, start, flags, wordParts);
	}

	private processChar(c: string, start: SourcePosition): CharProcessResult {
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
			return this.handleEscape(start);
		}

		// Command substitution: (...) - only outside quotes
		if (c === '(' && !this.stateCtx.inQuotes) {
			return this.readCommandSubstitution(start);
		}

		// Glob characters: * ?
		if ((c === '*' || c === '?') && !this.stateCtx.inQuotes) {
			return this.handleGlobChar(c, start);
		}

		// Character class: [...]
		if (c === '[' && !this.stateCtx.inQuotes) {
			return this.readCharacterClass(start);
		}

		// Regular character
		const quote = this.currentWordPartQuote();
		this.source.advance();
		return {
			chars: c,
			flags: createEmptyFlags(),
			done: false,
			part: this.createWordPart(
				'literal',
				c,
				start.span(this.source.position),
				quote
			),
		};
	}

	private handleGlobChar(
		c: string,
		start: SourcePosition
	): CharProcessResult {
		this.source.advance();
		const flags = createEmptyFlags();
		flags.containsGlob = true;
		// Note: ** (recursive glob) is NOT supported in the subset
		// We just treat consecutive * as two separate globs
		return {
			chars: c,
			flags,
			done: false,
			part: this.createWordPart(
				'glob',
				c,
				start.span(this.source.position)
			),
		};
	}

	// ─────────────────────────────────────────────────────────
	// Quote handlers
	// ─────────────────────────────────────────────────────────

	private handleSingleQuote(): CharProcessResult {
		if (this.stateCtx.inSingleQuote) {
			// Closing quote
			this.stateCtx.pop();
			this.source.advance();
			return {
				chars: '',
				flags: createEmptyFlags(),
				done: false,
				part: null,
			};
		}

		// Opening quote
		this.stateCtx.push(LexerState.SINGLE_QUOTED);
		this.source.advance();
		const flags = createEmptyFlags();
		flags.singleQuoted = true;
		flags.quoted = true;
		return { chars: '', flags, done: false, part: null };
	}

	private handleDoubleQuote(): CharProcessResult {
		if (this.stateCtx.inDoubleQuote) {
			// Closing quote
			this.stateCtx.pop();
			this.source.advance();
			return {
				chars: '',
				flags: createEmptyFlags(),
				done: false,
				part: null,
			};
		}

		// Opening quote
		this.stateCtx.push(LexerState.DOUBLE_QUOTED);
		this.source.advance();
		const flags = createEmptyFlags();
		flags.doubleQuoted = true;
		flags.quoted = true;
		return { chars: '', flags, done: false, part: null };
	}

	private handleEscape(start: SourcePosition): CharProcessResult {
		const quote = this.currentWordPartQuote();
		this.source.advance(); // consume backslash
		const next = this.source.peek();

		if (this.source.eof || next === '\0') {
			// Trailing backslash
			return {
				chars: '\\',
				flags: createEmptyFlags(),
				done: false,
				part: this.createWordPart(
					'literal',
					'\\',
					start.span(this.source.position),
					quote
				),
			};
		}

		// Line continuation
		if (next === '\n') {
			this.source.advance();
			return {
				chars: '',
				flags: createEmptyFlags(),
				done: false,
				part: null,
			};
		}

		// In double quotes, only \" and \\ are special (minimal escaping per spec)
		if (this.stateCtx.inDoubleQuote) {
			if ('"\\'.includes(next)) {
				this.source.advance();
				return {
					chars: next,
					flags: createEmptyFlags(),
					done: false,
					part: this.createWordPart(
						'literal',
						next,
						start.span(this.source.position),
						quote,
						true
					),
				};
			}
			// Backslash is literal before other chars in double quotes
			return {
				chars: '\\',
				flags: createEmptyFlags(),
				done: false,
				part: this.createWordPart(
					'literal',
					'\\',
					start.span(this.source.position),
					quote
				),
			};
		}

		// Outside quotes, backslash escapes any character (removes special meaning)
		this.source.advance();
		return {
			chars: next,
			flags: createEmptyFlags(),
			done: false,
			part: this.createWordPart(
				'literal',
				next,
				start.span(this.source.position),
				quote,
				true
			),
		};
	}

	// ─────────────────────────────────────────────────────────
	// Command substitution handler
	// ─────────────────────────────────────────────────────────

	private readCommandSubstitution(start: SourcePosition): CharProcessResult {
		const quote = this.currentWordPartQuote();
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
		return {
			chars: result,
			flags,
			done: false,
			part: this.createWordPart(
				'commandSub',
				result,
				start.span(this.source.position),
				quote
			),
		};
	}

	private readCharacterClass(start: SourcePosition): CharProcessResult {
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
		return {
			chars: result,
			flags,
			done: false,
			part: this.createWordPart(
				'glob',
				result,
				start.span(this.source.position)
			),
		};
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
		flags: TokenFlagsObject,
		wordParts: readonly TokenWordPart[]
	): Token {
		const normalizedWordParts =
			wordParts.length > 0
				? wordParts
				: [
						this.createWordPart(
							'literal',
							spelling,
							start.span(this.source.position)
						),
					];

		// No keywords in the subset - commands are just words
		return this.makeToken(
			classifySpellingKind(spelling),
			spelling,
			start,
			flags,
			normalizedWordParts
		);
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
		return isSpecialChar(c);
	}

	private isWordBoundary(c: string): boolean {
		return isWordBoundaryChar(c);
	}

	private makeToken(
		kind: TokenKind,
		spelling: string,
		start: SourcePosition,
		flags: TokenFlagsObject = createEmptyFlags(),
		wordParts: readonly TokenWordPart[] = []
	): Token {
		return new Token(
			kind,
			spelling,
			start.span(this.source.position),
			flags,
			wordParts
		);
	}

	private createWordPart(
		kind: TokenWordPart['kind'],
		text: string,
		span: SourceSpan,
		quote: TokenWordPartQuote = 'none',
		escaped = false
	): TokenWordPart {
		return {
			escaped,
			kind,
			quote,
			span,
			text,
		};
	}

	private appendWordPart(
		wordParts: TokenWordPart[],
		part: TokenWordPart
	): void {
		if (part.text === '') {
			return;
		}

		const previousPart = wordParts.at(-1);
		if (
			previousPart?.kind === 'literal' &&
			part.kind === 'literal' &&
			previousPart.quote === part.quote &&
			previousPart.escaped === part.escaped &&
			previousPart.span.end.offset === part.span.start.offset
		) {
			wordParts[wordParts.length - 1] = this.createWordPart(
				'literal',
				`${previousPart.text}${part.text}`,
				new SourceSpan(previousPart.span.start, part.span.end),
				part.quote,
				part.escaped
			);
			return;
		}

		wordParts.push(part);
	}

	private currentWordPartQuote(): TokenWordPartQuote {
		if (this.stateCtx.inSingleQuote) {
			return 'single';
		}
		if (this.stateCtx.inDoubleQuote) {
			return 'double';
		}
		return 'none';
	}
}
