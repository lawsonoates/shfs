/**
 * Word parser for the Fish subset parser.
 *
 * Handles parsing of words and their components:
 * - Literal text
 * - Glob patterns (* ? [...])
 * - Command substitution (...)
 * - Quoted strings
 */

import { Effect } from 'effect';
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
		return Effect.runSync(this.parseWordEffect());
	}

	parseWordEffect(): Effect.Effect<Word | null, ParseSyntaxError> {
		const wordParser = this;
		return Effect.gen(function* () {
			const token = wordParser.parser.currentToken;

			// Check if current token can start a word
			if (!wordParser.isWordToken(token)) {
				return null;
			}

			const startPos = token.span.start;

			// Parse the single token into word parts
			const parts = yield* wordParser.parseWordPartsEffect(token);

			if (parts.length === 0) {
				return null;
			}

			// Advance past this token
			wordParser.parser.advance();

			const endPos = token.span.end;
			const span = new SourceSpan(startPos, endPos);
			const quoted = token.isQuoted;

			return new Word(span, parts, quoted);
		});
	}

	private parseWordPartsEffect(
		token: Token
	): Effect.Effect<WordPart[], ParseSyntaxError> {
		const wordParser = this;
		return Effect.gen(function* () {
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
				parts.push(yield* wordParser.parseTokenWordPartEffect(part));
			}
			return parts;
		});
	}

	private parseTokenWordPartEffect(
		part: TokenWordPart
	): Effect.Effect<WordPart, ParseSyntaxError> {
		const wordParser = this;
		return Effect.gen(function* () {
			switch (part.kind) {
				case 'literal':
					return new LiteralPart(part.span, part.text);
				case 'glob':
					return new GlobPart(part.span, part.text);
				case 'commandSub':
					return yield* wordParser.parseCommandSubstitutionEffect(
						part.text,
						part.span
					);
				default: {
					const _exhaustive: never = part;
					return yield* new ParseSyntaxError(
						`Unknown token word part: ${JSON.stringify(_exhaustive)}`,
						wordParser.parser.currentToken.span,
						{ code: 'unknown-word-part' }
					);
				}
			}
		});
	}

	private parseCommandSubstitutionEffect(
		spelling: string,
		span: SourceSpan
	): Effect.Effect<CommandSubPart, ParseSyntaxError> {
		const wordParser = this;
		return Effect.gen(function* () {
			let inner = spelling;

			// Extract the inner content (remove outer parens)
			// The lexer includes the parens in the spelling
			if (inner.startsWith('(') && inner.endsWith(')')) {
				inner = inner.slice(1, -1);
			}

			// Parse the inner content recursively
			const innerProgram =
				yield* wordParser.parser.parseSubstitutionEffect(inner);

			return new CommandSubPart(span, innerProgram);
		});
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
