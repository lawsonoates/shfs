import { TokenKind } from './token';

/**
 * Entry for a multi-character operator.
 */
export interface OperatorEntry {
	pattern: string;
	kind: TokenKind;
}

/**
 * Multi-character operators sorted by length (longest first) for greedy matching.
 *
 * The scanner consumes this table greedily before checking single-character
 * operators.
 */
export const OPERATORS: readonly OperatorEntry[] = [
	{ kind: TokenKind.AND_AND, pattern: '&&' },
	{ kind: TokenKind.OR_OR, pattern: '||' },
];

/**
 * Single-character operators for O(1) lookup.
 */
export const SINGLE_CHAR_OPS: ReadonlyMap<string, TokenKind> = new Map([
	['|', TokenKind.PIPE],
	[';', TokenKind.SEMICOLON],
	['<', TokenKind.LESS],
	['>', TokenKind.GREAT],
]);

/**
 * Characters that are special and require careful handling.
 * These can start or affect token boundaries.
 *
 * Simplified for fish subset - no $, {, }, ~
 */
export const SPECIAL_CHARS = new Set([
	' ',
	'\t',
	'\n',
	'|',
	';',
	'<',
	'>',
	'(',
	')',
	'"',
	"'",
	'\\',
	'*',
	'?',
	'[',
	'#',
]);

/**
 * Characters that definitively end a word (token boundary).
 */
export const WORD_BOUNDARY_CHARS = new Set([
	' ',
	'\t',
	'\n',
	'|',
	';',
	'<',
	'>',
	')',
	'\0',
]);
