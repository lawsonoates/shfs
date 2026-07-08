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
	VariablePart,
	Word,
	type WordPart,
} from './ast';
import type { Parser } from './parser';
import { ParseSyntaxError } from './syntax-error';

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

		const parts: WordPart[] = [];
		for (const part of tokenWordParts) {
			parts.push(this.parseTokenWordPart(part));
		}
		return parts;
	}

	private parseTokenWordPart(part: TokenWordPart): WordPart {
		switch (part.kind) {
			case 'literal':
				return new LiteralPart(part.span, part.text);
			case 'glob':
				return new GlobPart(part.span, part.text);
			case 'commandSub': {
				// Parse the inner content recursively for early validation.
				const innerProgram = this.parser.parseSubstitution(part.source);
				return new CommandSubPart(
					part.span,
					innerProgram,
					part.source,
					part.quote === 'double',
					part.index
				);
			}
			case 'variable':
				return new VariablePart(
					part.span,
					part.name,
					part.quote === 'double',
					part.index
				);
			default: {
				const _exhaustive: never = part;
				throw new ParseSyntaxError(
					`Unknown token word part: ${JSON.stringify(_exhaustive)}`,
					this.parser.currentToken.span,
					{ code: 'unknown-word-part' }
				);
			}
		}
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
