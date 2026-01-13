import type { SourceSpan } from './position';

/**
 * Token types for the fish subset lexer.
 *
 * This is a simplified subset of fish shell syntax focused on:
 * - Pipelines
 * - Command substitution (...)
 * - Globbing (* ? [...])
 * - Basic quoting
 * - Comments
 *
 * NOT supported: variables, brace expansion, control flow, functions
 */
export const TokenKind = {
	// === Meta ===
	EOF: 0,
	ERROR: 1,

	// === Whitespace & Structure ===
	NEWLINE: 2,
	COMMENT: 3,

	// === Words ===
	WORD: 4, // Generic word/argument
	NAME: 5, // Valid identifier name (command name)
	NUMBER: 6, // Numeric literal

	// === Single-char Operators ===
	PIPE: 7, // |
	LPAREN: 8, // ( - command substitution start
	RPAREN: 9, // ) - command substitution end
	LESS: 10, // < - input redirection (Phase 2)
	GREAT: 11, // > - output redirection (Phase 2)

	// === Expansion markers (for parser hints) ===
	COMMAND_SUB: 12, // (command)
	GLOB: 13, // contains * ? or [...]
} as const;

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

/**
 * Token flags for metadata about how the token was formed.
 */
export interface TokenFlagsObject {
	quoted: boolean;
	singleQuoted: boolean;
	doubleQuoted: boolean;
	containsExpansion: boolean; // command substitution
	containsGlob: boolean;
}

/**
 * Create an empty flags object.
 */
export function createEmptyFlags(): TokenFlagsObject {
	return {
		quoted: false,
		singleQuoted: false,
		doubleQuoted: false,
		containsExpansion: false,
		containsGlob: false,
	};
}

/**
 * Check if any quote flag is set.
 */
export function isQuoted(flags: TokenFlagsObject): boolean {
	return flags.quoted || flags.singleQuoted || flags.doubleQuoted;
}

/**
 * Human-readable names for token kinds.
 */
const TOKEN_KIND_NAMES: Record<TokenKind, string> = {
	[TokenKind.EOF]: 'EOF',
	[TokenKind.ERROR]: 'ERROR',
	[TokenKind.NEWLINE]: 'NEWLINE',
	[TokenKind.COMMENT]: 'COMMENT',
	[TokenKind.WORD]: 'WORD',
	[TokenKind.NAME]: 'NAME',
	[TokenKind.NUMBER]: 'NUMBER',
	[TokenKind.PIPE]: 'PIPE',
	[TokenKind.LPAREN]: 'LPAREN',
	[TokenKind.RPAREN]: 'RPAREN',
	[TokenKind.LESS]: 'LESS',
	[TokenKind.GREAT]: 'GREAT',
	[TokenKind.COMMAND_SUB]: 'COMMAND_SUB',
	[TokenKind.GLOB]: 'GLOB',
};

/**
 * Canonical spellings for operators and special tokens.
 */
const TOKEN_SPELLINGS: ReadonlyMap<TokenKind, string> = new Map([
	[TokenKind.EOF, '<eof>'],
	[TokenKind.ERROR, '<error>'],
	[TokenKind.NEWLINE, '\\n'],
	[TokenKind.PIPE, '|'],
	[TokenKind.LPAREN, '('],
	[TokenKind.RPAREN, ')'],
	[TokenKind.LESS, '<'],
	[TokenKind.GREAT, '>'],
]);

/**
 * Represents a single token from the lexer.
 */
export class Token {
	readonly kind: TokenKind;
	readonly spelling: string;
	readonly span: SourceSpan;
	readonly flags: TokenFlagsObject;

	constructor(
		kind: TokenKind,
		spelling: string,
		span: SourceSpan,
		flags: TokenFlagsObject = createEmptyFlags()
	) {
		this.kind = kind;
		this.spelling = spelling;
		this.span = span;
		this.flags = flags;
	}

	/**
	 * Get the canonical spelling for a token kind.
	 */
	static spell(kind: TokenKind): string {
		return TOKEN_SPELLINGS.get(kind) ?? '<unknown>';
	}

	/**
	 * Get the name of a token kind.
	 */
	static kindName(kind: TokenKind): string {
		return TOKEN_KIND_NAMES[kind] ?? 'UNKNOWN';
	}

	/**
	 * Check if this token is an operator.
	 */
	get isOperator(): boolean {
		return this.kind >= TokenKind.PIPE && this.kind <= TokenKind.GREAT;
	}

	/**
	 * Check if this token has any quote flags set.
	 */
	get isQuoted(): boolean {
		return isQuoted(this.flags);
	}

	/**
	 * Check if this token contains expansions (command substitution).
	 */
	get hasExpansions(): boolean {
		return this.flags.containsExpansion;
	}

	/**
	 * Check if this token contains glob patterns.
	 */
	get hasGlob(): boolean {
		return this.flags.containsGlob;
	}

	toString(): string {
		return `Token(${Token.kindName(this.kind)}, "${this.spelling}", ${this.span})`;
	}
}
