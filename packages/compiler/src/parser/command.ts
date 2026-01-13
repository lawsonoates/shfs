/**
 * Command parser for the Fish subset parser.
 *
 * Handles parsing of commands:
 * - Simple commands (name + args)
 * - Redirections (< > Phase 2)
 */

import { SourceSpan } from '../lexer/position';
import { TokenKind } from '../lexer/token';
import { Redirection, SimpleCommand, type Word } from './ast';
import type { Parser } from './parser';
import type { WordParser } from './word';

/**
 * Parser for commands.
 *
 * A command in the Fish subset is:
 * - A simple command: name followed by arguments and optional redirections
 *
 * Fish subset does NOT support:
 * - Compound commands (if, for, while, function, etc.)
 * - Background execution (&)
 * - Semicolons (;)
 */
export class CommandParser {
	private readonly parser: Parser;
	private readonly wordParser: WordParser;

	constructor(parser: Parser, wordParser: WordParser) {
		this.parser = parser;
		this.wordParser = wordParser;
	}

	/**
	 * Parse a command.
	 * Returns null if no command is present.
	 */
	parseCommand(): SimpleCommand | null {
		return this.parseSimpleCommand();
	}

	/**
	 * Parse a simple command: name + args + redirections.
	 *
	 * Grammar:
	 *   simple_command ::= word+ (redirection)*
	 */
	parseSimpleCommand(): SimpleCommand | null {
		const startPos = this.parser.currentToken.span.start;

		// Parse command name (first word)
		const name = this.wordParser.parseWord();
		if (!name) {
			return null;
		}

		// Parse arguments and redirections
		const args: Word[] = [];
		const redirections: Redirection[] = [];

		while (!this.isCommandTerminator()) {
			// Check for redirection
			const redir = this.parseRedirection();
			if (redir) {
				redirections.push(redir);
				continue;
			}

			// Try to parse a word argument
			const word = this.wordParser.parseWord();
			if (word) {
				args.push(word);
			} else {
				// No more words or redirections
				break;
			}
		}

		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);

		return new SimpleCommand(span, name, args, redirections);
	}

	/**
	 * Parse a redirection if present.
	 *
	 * Grammar:
	 *   redirection ::= '<' word | '>' word
	 */
	parseRedirection(): Redirection | null {
		const token = this.parser.currentToken;

		// Input redirection: < file
		if (token.kind === TokenKind.LESS) {
			const startPos = token.span.start;
			this.parser.advance(); // consume <

			const target = this.wordParser.parseWord();
			if (!target) {
				this.parser.syntacticError('Expected filename after <', 'word');
				return null;
			}

			const endPos = this.parser.previousTokenPosition;
			const span = new SourceSpan(startPos, endPos);

			return new Redirection(span, 'input', target);
		}

		// Output redirection: > file
		if (token.kind === TokenKind.GREAT) {
			const startPos = token.span.start;
			this.parser.advance(); // consume >

			const target = this.wordParser.parseWord();
			if (!target) {
				this.parser.syntacticError('Expected filename after >', 'word');
				return null;
			}

			const endPos = this.parser.previousTokenPosition;
			const span = new SourceSpan(startPos, endPos);

			return new Redirection(span, 'output', target);
		}

		return null;
	}

	/**
	 * Check if current token terminates a command.
	 */
	private isCommandTerminator(): boolean {
		const kind = this.parser.currentToken.kind;
		return (
			kind === TokenKind.PIPE ||
			kind === TokenKind.NEWLINE ||
			kind === TokenKind.EOF
		);
	}
}
