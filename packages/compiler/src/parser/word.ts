/**
 * Word parser for the Fish subset parser.
 *
 * Handles parsing of words and their components:
 * - Literal text
 * - Glob patterns (* ? [...])
 * - Command substitution (...)
 * - Quoted strings
 */

import { SourceSpan } from '../lexer/position';
import { type Token, TokenKind, type TokenWordPart } from '../lexer/token';
import {
	CommandSubPart,
	GlobPart,
	LiteralPart,
	Word,
	type WordPart,
} from './ast';
import type { Parser } from './parser';

/**
 * Parser for words and word parts.
 *
 * A word can consist of:
 * - Literal parts (plain text)
 * - Glob parts (* ? [...])
 * - Command substitution parts (...)
 */
export class WordParser {
	private readonly parser: Parser;

	constructor(parser: Parser) {
		this.parser = parser;
	}

	/**
	 * Parse a single word from the current position.
	 * Returns null if no word is present.
	 *
	 * A word consists of a single token from the scanner.
	 * The token may contain multiple parts (literal, glob, command substitution)
	 * which are parsed and combined into a single Word AST node.
	 */
	parseWord(): Word | null {
		const token = this.parser.currentToken;

		// Check if current token can start a word
		if (!this.isWordToken(token)) {
			return null;
		}

		const startPos = token.span.start;

		// Parse the single token into word parts
		const parts = this.parseWordParts(token);

		if (parts.length === 0) {
			return null;
		}

		// Advance past this token
		this.parser.advance();

		const endPos = token.span.end;
		const span = new SourceSpan(startPos, endPos);
		const quoted = token.isQuoted;

		return new Word(span, parts, quoted);
	}

	/**
	 * Parse ordered word parts from token metadata.
	 */
	private parseWordParts(token: Token): WordPart[] {
		const tokenWordParts =
			token.wordParts.length > 0
				? token.wordParts
				: [
						{
							escaped: false,
							kind: 'literal' as const,
							quote: 'none' as const,
							span: token.span,
							text: token.spelling,
						},
					];

		return tokenWordParts.map((part) => this.parseTokenWordPart(part));
	}

	/**
	 * Parse a single token word part into an AST part.
	 */
	private parseTokenWordPart(part: TokenWordPart): WordPart {
		switch (part.kind) {
			case 'literal':
				return new LiteralPart(part.span, part.text);
			case 'glob':
				return new GlobPart(part.span, part.text);
			case 'commandSub':
				return this.parseCommandSubstitution(part.text, part.span);
			default: {
				const _exhaustive: never = part;
				throw new Error(
					`Unknown token word part: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	}

	/**
	 * Parse a command substitution from token part metadata.
	 * The part text contains the full (...) content.
	 */
	private parseCommandSubstitution(
		spelling: string,
		span: SourceSpan
	): CommandSubPart {
		let inner = spelling;

		// Extract the inner content (remove outer parens)
		// The lexer includes the parens in the spelling
		if (inner.startsWith('(') && inner.endsWith(')')) {
			inner = inner.slice(1, -1);
		}

		// Parse the inner content recursively
		const innerProgram = this.parser.parseSubstitution(inner);

		return new CommandSubPart(span, innerProgram);
	}

	/**
	 * Check if a token can be part of a word.
	 */
	private isWordToken(token: Token): boolean {
		const kind = token.kind;
		return (
			kind === TokenKind.WORD ||
			kind === TokenKind.NAME ||
			kind === TokenKind.NUMBER
		);
	}
}
