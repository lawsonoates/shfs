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
import { type Token, TokenKind } from '../lexer/token';
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
	 */
	parseWord(): Word | null {
		const token = this.parser.currentToken;

		// Check if current token can start a word
		if (!this.isWordToken(token)) {
			return null;
		}

		const startPos = token.span.start;
		const parts = this.parseWordParts();

		if (parts.length === 0) {
			return null;
		}

		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);
		const quoted = token.isQuoted;

		return new Word(span, parts, quoted);
	}

	/**
	 * Parse word parts until we hit a word boundary.
	 */
	parseWordParts(): WordPart[] {
		const parts: WordPart[] = [];

		while (this.isWordToken(this.parser.currentToken)) {
			const token = this.parser.currentToken;
			const part = this.parseWordPart(token);

			if (part) {
				parts.push(part);
			}

			this.parser.advance();
		}

		return parts;
	}

	/**
	 * Parse a single word part from a token.
	 */
	private parseWordPart(token: Token): WordPart | null {
		// Command substitution token - contains (...)
		if (token.hasExpansions) {
			return this.parseCommandSubstitution(token);
		}

		// Glob pattern
		if (token.hasGlob) {
			return this.parseGlobPart(token);
		}

		// Regular literal
		return new LiteralPart(token.span, token.spelling);
	}

	/**
	 * Parse a command substitution from a token.
	 * The token spelling contains the full (...) content.
	 */
	private parseCommandSubstitution(token: Token): CommandSubPart {
		const spelling = token.spelling;

		// Extract the inner content (remove outer parens)
		// The lexer includes the parens in the spelling
		let inner = spelling;
		if (inner.startsWith('(') && inner.endsWith(')')) {
			inner = inner.slice(1, -1);
		}

		// Parse the inner content recursively
		const innerProgram = this.parser.parseSubstitution(inner);

		return new CommandSubPart(token.span, innerProgram);
	}

	/**
	 * Parse a glob pattern from a token.
	 */
	private parseGlobPart(token: Token): GlobPart {
		return new GlobPart(token.span, token.spelling);
	}

	/**
	 * Check if a token can be part of a word.
	 */
	private isWordToken(token: Token): boolean {
		const kind = token.kind;
		return (
			kind === TokenKind.WORD ||
			kind === TokenKind.NAME ||
			kind === TokenKind.NUMBER ||
			kind === TokenKind.GLOB ||
			kind === TokenKind.COMMAND_SUB
		);
	}
}
