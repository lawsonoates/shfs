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
 * For the fish subset, we only support:
 * - | (pipe)
 * - > (output redirection - Phase 2)
 * - < (input redirection - Phase 2)
 *
 * NOT supported: &&, ||, >>, &>, >?, ;, &
 */
export const OPERATORS: readonly OperatorEntry[] = [
	// No multi-char operators in the subset
];

/**
 * Single-character operators for O(1) lookup.
 */
export const SINGLE_CHAR_OPS: ReadonlyMap<string, TokenKind> = new Map([
	['|', TokenKind.PIPE],
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
	'<',
	'>',
	'(',
	')',
	'\0',
]);
