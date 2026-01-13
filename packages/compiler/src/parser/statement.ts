/**
 * Statement parser for the Fish subset parser.
 *
 * Handles parsing of:
 * - Pipelines (command | command | ...)
 *
 * Fish subset does NOT support:
 * - Multiple statements (no ; or newline-separated statements)
 * - Control flow (if, for, while, etc.)
 */

import { SourceSpan } from '../lexer/position';
import { TokenKind } from '../lexer/token';
import { Pipeline, type SimpleCommand } from './ast';
import type { CommandParser } from './command';
import type { Parser } from './parser';

/**
 * Parser for statements and pipelines.
 *
 * In the Fish subset, a program is a single pipeline.
 */
export class StatementParser {
	private readonly parser: Parser;
	private readonly commandParser: CommandParser;

	constructor(parser: Parser, commandParser: CommandParser) {
		this.parser = parser;
		this.commandParser = commandParser;
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
}
