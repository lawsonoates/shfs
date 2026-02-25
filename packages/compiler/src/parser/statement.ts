/**
 * Statement parser for the Fish subset parser.
 *
 * Handles parsing of:
 * - Script statements separated by newline or semicolon
 * - Pipelines (command | command | ...)
 */

import { SourceSpan } from '../lexer/position';
import { TokenKind } from '../lexer/token';
import {
	Pipeline,
	Program,
	type SimpleCommand,
	Statement,
	type StatementChainMode,
} from './ast';
import type { CommandParser } from './command';
import type { Parser } from './parser';

/**
 * Parser for statements and pipelines.
 *
 * In this subset, a program is an ordered list of statements.
 */
export class StatementParser {
	private readonly parser: Parser;
	private readonly commandParser: CommandParser;

	constructor(parser: Parser, commandParser: CommandParser) {
		this.parser = parser;
		this.commandParser = commandParser;
	}

	/**
	 * Parse a full script program.
	 */
	parseScript(): Program {
		const startPos = this.parser.currentToken.span.start;
		const statements: Statement[] = [];

		// Ignore leading separators/comments and allow empty lines.
		this.consumeSeparatorsAndComments();

		while (this.parser.currentToken.kind !== TokenKind.EOF) {
			const statement = this.parseStatement();
			if (!statement) {
				this.parser.syntacticError('Expected command', 'command');
			}

			statements.push(statement);

			const sawSeparator = this.consumeSeparatorsAndComments();
			if (
				this.parser.currentToken.kind !== TokenKind.EOF &&
				!sawSeparator
			) {
				this.parser.syntacticError(
					'Expected statement separator',
					'newline or ;'
				);
			}
		}

		const endPos = this.parser.previousTokenPosition;
		return new Program(new SourceSpan(startPos, endPos), statements);
	}

	/**
	 * Parse a single statement.
	 */
	parseStatement(): Statement | null {
		let chainMode: StatementChainMode = 'always';
		const currentToken = this.parser.currentToken;
		if (
			!currentToken.isQuoted &&
			this.isChainKeyword(currentToken.spelling)
		) {
			chainMode = currentToken.spelling === 'and' ? 'and' : 'or';
			this.parser.advance();
		}

		const pipeline = this.parsePipeline();
		if (!pipeline) {
			return null;
		}

		return new Statement(pipeline.span, pipeline, chainMode);
	}

	/**
	 * Parse a pipeline.
	 *
	 * Grammar:
	 *   pipeline ::= command ('|' command)*
	 */
	parsePipeline(): Pipeline | null {
		const startPos = this.parser.currentToken.span.start;

		// Parse first command
		const firstCommand = this.commandParser.parseCommand();
		if (!firstCommand) {
			return null;
		}

		const commands: SimpleCommand[] = [firstCommand];

		// Parse remaining commands in pipeline
		while (this.parser.currentToken.kind === TokenKind.PIPE) {
			this.parser.advance(); // consume |

			// Skip any newlines after pipe (line continuation)
			this.skipNewlines();

			const command = this.commandParser.parseCommand();
			if (!command) {
				this.parser.syntacticError(
					'Expected command after |',
					'command'
				);
				break;
			}

			commands.push(command);
		}

		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);

		return new Pipeline(span, commands);
	}

	/**
	 * Skip newline tokens (for line continuation after pipe).
	 */
	private skipNewlines(): void {
		while (this.parser.currentToken.kind === TokenKind.NEWLINE) {
			this.parser.advance();
		}
	}

	/**
	 * Consume separators and comments between statements.
	 *
	 * @returns true if at least one statement separator was consumed.
	 */
	private consumeSeparatorsAndComments(): boolean {
		let sawSeparator = false;
		while (true) {
			const tokenKind = this.parser.currentToken.kind;
			if (tokenKind === TokenKind.COMMENT) {
				this.parser.advance();
				continue;
			}
			if (
				tokenKind === TokenKind.NEWLINE ||
				tokenKind === TokenKind.SEMICOLON
			) {
				sawSeparator = true;
				this.parser.advance();
				continue;
			}
			return sawSeparator;
		}
	}

	private isChainKeyword(spelling: string): spelling is 'and' | 'or' {
		return spelling === 'and' || spelling === 'or';
	}
}
