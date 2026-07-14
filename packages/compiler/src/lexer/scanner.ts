import { InvalidEscapeError } from '../parser/syntax-error';
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

const BYTE_DECODER = new TextDecoder();
const ASCII_LETTER_REGEX = /^[A-Za-z]$/;
const HEX_DIGIT_REGEX = /^[\dA-Fa-f]$/;
const OCTAL_DIGIT_REGEX = /^[0-7]$/;
const MAX_OCTAL_ESCAPE_VALUE = 0o177;
const MAX_SHORT_UNICODE_ESCAPE_VALUE = 0xff_ff;
const MAX_UNICODE_ESCAPE_VALUE = 0x10_ff_ff;
const MIN_UNICODE_SURROGATE = 0xd8_00;
const MAX_UNICODE_SURROGATE = 0xdf_ff;

const CHARACTER_ESCAPES: Readonly<Record<string, string>> = {
	a: '\u0007',
	b: '\b',
	e: '\u001b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
};

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
		case '$':
		case '&':
			return true;
		default:
			return false;
	}
}

function isVariableNameStart(c: string): boolean {
	return isNameStartCode(c.charCodeAt(0));
}

function isVariableNameChar(c: string): boolean {
	const code = c.charCodeAt(0);
	return isNameStartCode(code) || isDigitCode(code);
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

interface IndexSuffix {
	raw: string;
	text: string;
}

interface IndexState {
	commandSubstitutionDepth: number;
	depth: number;
	index: string;
	quote: "'" | '"' | null;
	raw: string;
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

		// Multi-char operators: && and ||
		if (c0 === '&' && this.source.peek(1) === '&') {
			this.source.advance();
			this.source.advance();
			return this.makeToken(TokenKind.AND_AND, '&&', start);
		}
		if (c0 === '|' && this.source.peek(1) === '|') {
			this.source.advance();
			this.source.advance();
			return this.makeToken(TokenKind.OR_OR, '||', start);
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
			const simpleWord = this.source.readSimpleWord();
			if (simpleWord.spelling.length === 0) {
				return null;
			}

			// Check if we hit a simple delimiter (fast path success)
			const next = this.source.peek();
			if (this.isWordBoundary(next)) {
				const span = start.span(this.source.position);
				return new Token(
					simpleWord.kind,
					simpleWord.spelling,
					span,
					createEmptyFlags(),
					[this.createWordPart('literal', simpleWord.spelling, span)]
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

			// && ends a word (|| is covered by "|" being a boundary).
			if (
				!this.stateCtx.inQuotes &&
				c === '&' &&
				this.source.peek(1) === '&'
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

		// Dollar expansion: $name, $name[...], or $(...)
		if (c === '$' && !this.stateCtx.inSingleQuote) {
			return this.handleDollar(start);
		}

		// Command substitution: (...) - only outside quotes
		if (c === '(' && !this.stateCtx.inQuotes) {
			return this.readCommandSubstitution(start, '');
		}

		// Glob characters: * ?
		if ((c === '*' || c === '?') && !this.stateCtx.inQuotes) {
			return this.handleGlobChar(c, start);
		}

		// Character class: [...] - only when a "]" closes it within the word
		if (
			c === '[' &&
			!this.stateCtx.inQuotes &&
			this.hasCharacterClassEnd()
		) {
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

		// In double quotes, only \", \\ and \$ are special (minimal escaping)
		if (this.stateCtx.inDoubleQuote) {
			if ('"\\$'.includes(next)) {
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

		// Outside quotes, fish decodes character, byte, numeric, and Unicode
		// escapes. Unknown escapes still quote the following character.
		const escaped = this.readUnquotedEscape(start);
		return {
			chars: escaped,
			flags: createEmptyFlags(),
			done: false,
			part: this.createWordPart(
				'literal',
				escaped,
				start.span(this.source.position),
				quote,
				true
			),
		};
	}

	private readUnquotedEscape(start: SourcePosition): string {
		const marker = this.source.peek();
		const character = CHARACTER_ESCAPES[marker];
		if (character !== undefined) {
			this.source.advance();
			return character;
		}

		if (marker === 'x' || marker === 'X') {
			if (!HEX_DIGIT_REGEX.test(this.source.peek(1))) {
				this.source.advance();
				throw new InvalidEscapeError(
					`\\${marker}`,
					start.span(this.source.position)
				);
			}
			return this.readByteEscapes();
		}

		if (marker === 'u') {
			return this.readCodePointEscape(
				start,
				4,
				MAX_SHORT_UNICODE_ESCAPE_VALUE
			);
		}

		if (marker === 'U') {
			return this.readCodePointEscape(start, 8, MAX_UNICODE_ESCAPE_VALUE);
		}

		if (OCTAL_DIGIT_REGEX.test(marker)) {
			const digits = this.readDigits(OCTAL_DIGIT_REGEX, 3);
			const value = Number.parseInt(digits, 8);
			if (value > MAX_OCTAL_ESCAPE_VALUE) {
				throw new InvalidEscapeError(
					`\\${digits}`,
					start.span(this.source.position)
				);
			}
			return String.fromCodePoint(value);
		}

		if (marker === 'c' && ASCII_LETTER_REGEX.test(this.source.peek(1))) {
			this.source.advance();
			return String.fromCodePoint(
				this.source.advance().toUpperCase().charCodeAt(0) % 32
			);
		}

		return this.source.advance();
	}

	private readByteEscapes(): string {
		const bytes: number[] = [];
		while (true) {
			this.source.advance(); // x / X
			bytes.push(
				Number.parseInt(this.readDigits(HEX_DIGIT_REGEX, 2), 16)
			);
			if (
				this.source.peek() !== '\\' ||
				!['x', 'X'].includes(this.source.peek(1)) ||
				!HEX_DIGIT_REGEX.test(this.source.peek(2))
			) {
				break;
			}
			this.source.advance(); // backslash before the next byte
		}
		return BYTE_DECODER.decode(Uint8Array.from(bytes));
	}

	private readCodePointEscape(
		start: SourcePosition,
		maxDigits: number,
		maxValue: number
	): string {
		const prefix = this.source.advance(); // u / U
		const digits = this.readDigits(HEX_DIGIT_REGEX, maxDigits);
		const value = Number.parseInt(digits, 16);
		if (digits === '' || value > maxValue) {
			throw new InvalidEscapeError(
				`\\${prefix}${digits}`,
				start.span(this.source.position)
			);
		}
		if (value >= MIN_UNICODE_SURROGATE && value <= MAX_UNICODE_SURROGATE) {
			return '\ufffd';
		}
		return String.fromCodePoint(value);
	}

	private readDigits(pattern: RegExp, limit: number): string {
		let digits = '';
		while (digits.length < limit && pattern.test(this.source.peek())) {
			digits += this.source.advance();
		}
		return digits;
	}

	// ─────────────────────────────────────────────────────────
	// Dollar expansion handlers
	// ─────────────────────────────────────────────────────────

	private handleDollar(start: SourcePosition): CharProcessResult {
		const next = this.source.peek(1);

		// $(...) command substitution, allowed inside double quotes.
		if (next === '(') {
			this.source.advance(); // consume $
			return this.readCommandSubstitution(start, '$');
		}

		// $name variable reference, allowed inside double quotes.
		if (isVariableNameStart(next)) {
			return this.readVariable(start);
		}

		// Bare dollar stays literal.
		const quote = this.currentWordPartQuote();
		this.source.advance();
		return {
			chars: '$',
			flags: createEmptyFlags(),
			done: false,
			part: this.createWordPart(
				'literal',
				'$',
				start.span(this.source.position),
				quote
			),
		};
	}

	private readVariable(start: SourcePosition): CharProcessResult {
		const quote = this.currentWordPartQuote();
		let raw = this.source.advance(); // $

		let name = '';
		while (!this.source.eof && isVariableNameChar(this.source.peek())) {
			name += this.source.advance();
		}
		raw += name;

		const suffix = this.readIndexSuffix();
		if (suffix !== null) {
			raw += suffix.raw;
		}

		const flags = createEmptyFlags();
		flags.containsExpansion = true;
		const span = start.span(this.source.position);
		return {
			chars: raw,
			flags,
			done: false,
			part: {
				escaped: false,
				index: suffix?.text ?? null,
				kind: 'variable',
				name,
				quote,
				span,
				text: raw,
			},
		};
	}

	/**
	 * Read a trailing `[...]` index expression after a variable or command
	 * substitution. Spaces are allowed inside the brackets; newlines are not.
	 * Returns the inner text, or null when no index expression follows.
	 */
	private readIndexSuffix(): IndexSuffix | null {
		if (this.source.peek() !== '[') {
			return null;
		}

		const outerQuote = this.currentWordPartQuote();
		const state: IndexState = {
			commandSubstitutionDepth: 0,
			depth: 1,
			index: '',
			quote: null,
			raw: this.source.advance(), // [
		};

		while (!this.source.eof) {
			const char = this.source.peek();
			if (state.quote !== null) {
				this.readQuotedIndexChar(state);
				continue;
			}

			if (this.readIndexSubstitutionComment(state, char)) {
				continue;
			}

			if (
				state.commandSubstitutionDepth === 0 &&
				this.endsIndexBeforeCharacter(char, outerQuote)
			) {
				return { raw: state.raw, text: `[${state.index}` };
			}

			if (char === '\\') {
				this.readEscapedIndexChar(state);
				continue;
			}

			if (char === "'" || char === '"') {
				state.quote = char;
				state.raw += this.source.advance();
				state.index += char;
				continue;
			}

			this.updateIndexDelimiterDepths(state, char);
			state.raw += this.source.advance();
			if (state.depth === 0) {
				return { raw: state.raw, text: state.index };
			}
			state.index += char;
		}

		return { raw: state.raw, text: `[${state.index}` };
	}

	private readIndexSubstitutionComment(
		state: IndexState,
		char: string
	): boolean {
		if (
			char !== '#' ||
			state.commandSubstitutionDepth === 0 ||
			!this.canStartSubstitutionComment(state.index)
		) {
			return false;
		}

		const comment = this.readSubstitutionComment();
		state.raw += comment;
		state.index += comment;
		return true;
	}

	private endsIndexBeforeCharacter(
		char: string,
		outerQuote: TokenWordPartQuote
	): boolean {
		return (
			char === '\n' ||
			char === '\0' ||
			(outerQuote === 'double' && char === '"') ||
			(outerQuote === 'single' && char === "'")
		);
	}

	private readEscapedIndexChar(state: IndexState): void {
		const escapeMarker = this.source.advance();
		state.raw += escapeMarker;
		state.index += escapeMarker;
		if (this.source.eof || this.source.peek() === '\n') {
			return;
		}

		const escaped = this.source.advance();
		state.raw += escaped;
		state.index += escaped;
	}

	private updateIndexDelimiterDepths(state: IndexState, char: string): void {
		if (char === '(') {
			state.commandSubstitutionDepth += 1;
			return;
		}
		if (char === ')' && state.commandSubstitutionDepth > 0) {
			state.commandSubstitutionDepth -= 1;
			return;
		}
		if (state.commandSubstitutionDepth > 0) {
			return;
		}
		if (char === '[') {
			state.depth += 1;
		} else if (char === ']') {
			state.depth -= 1;
		}
	}

	private readQuotedIndexChar(state: IndexState): void {
		const char = this.source.advance();
		state.raw += char;
		state.index += char;
		if (char === '\\' && state.quote === '"' && !this.source.eof) {
			const escaped = this.source.advance();
			state.raw += escaped;
			state.index += escaped;
			return;
		}
		if (char === state.quote) {
			state.quote = null;
		}
	}

	/**
	 * Check whether a `[` begins a character class: a closing `]` must appear
	 * before any whitespace, newline, or EOF.
	 */
	private hasCharacterClassEnd(): boolean {
		let lookahead = 1;
		// A leading negation or literal ] does not close the class.
		const first = this.source.peek(lookahead);
		if (first === '!' || first === '^') {
			lookahead++;
		}
		if (this.source.peek(lookahead) === ']') {
			lookahead++;
		}
		while (true) {
			const c = this.source.peek(lookahead);
			if (c === ']') {
				return true;
			}
			if (c === ' ' || c === '\t' || c === '\n' || c === '\0') {
				return false;
			}
			lookahead++;
		}
	}

	// ─────────────────────────────────────────────────────────
	// Command substitution handler
	// ─────────────────────────────────────────────────────────

	private readCommandSubstitution(
		start: SourcePosition,
		prefix: string
	): CharProcessResult {
		const quote = this.currentWordPartQuote();
		let result = '';
		result += this.source.advance(); // (

		let depth = 1;
		while (depth > 0 && !this.source.eof) {
			const chunk = this.readSubstitutionChunk(result);
			depth += chunk.depth;
			result += chunk.chars;
		}

		const source = result.endsWith(')')
			? result.slice(1, -1)
			: result.slice(1);

		const suffix = this.readIndexSuffix();
		let raw = `${prefix}${result}`;
		if (suffix !== null) {
			raw += suffix.raw;
		}

		const flags = createEmptyFlags();
		flags.containsExpansion = true;
		const span = start.span(this.source.position);
		return {
			chars: raw,
			flags,
			done: false,
			part: {
				escaped: false,
				index: suffix?.text ?? null,
				kind: 'commandSub',
				quote,
				source,
				span,
				text: raw,
			},
		};
	}

	private readSubstitutionChunk(source: string): {
		chars: string;
		depth: number;
	} {
		const char = this.source.peek();
		if (char === '#' && this.canStartSubstitutionComment(source)) {
			return { chars: this.readSubstitutionComment(), depth: 0 };
		}
		if (char === '(') {
			return { chars: this.source.advance(), depth: 1 };
		}
		if (char === ')') {
			return { chars: this.source.advance(), depth: -1 };
		}
		if (char === "'" || char === '"') {
			return { chars: this.skipQuotedContent(char), depth: 0 };
		}
		if (char === '\\') {
			let chars = this.source.advance();
			if (!this.source.eof) {
				chars += this.source.advance();
			}
			return { chars, depth: 0 };
		}
		return { chars: this.source.advance(), depth: 0 };
	}

	private canStartSubstitutionComment(source: string): boolean {
		const previous = source.at(-1);
		const followsTokenBoundary =
			previous === '(' ||
			previous === ';' ||
			previous === '|' ||
			previous === '&' ||
			previous === ' ' ||
			previous === '\t' ||
			previous === '\n';
		if (!followsTokenBoundary) {
			return false;
		}

		let precedingBackslashCount = 0;
		let index = source.length - 2;
		while (index >= 0 && source[index] === '\\') {
			precedingBackslashCount++;
			index--;
		}
		return precedingBackslashCount % 2 === 0;
	}

	private readSubstitutionComment(): string {
		let comment = '';
		while (!this.source.eof && this.source.peek() !== '\n') {
			comment += this.source.advance();
		}
		return comment;
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
		const span = start.span(this.source.position);
		const normalizedWordParts =
			wordParts.length > 0
				? wordParts
				: [this.createWordPart('literal', spelling, span)];

		// No keywords in the subset - commands are just words
		return new Token(
			classifySpellingKind(spelling),
			spelling,
			span,
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
		kind: 'literal' | 'glob',
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
