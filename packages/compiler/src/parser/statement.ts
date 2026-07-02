/**
 * Statement parser for the Fish subset parser.
 *
 * Handles parsing of:
 * - Script statements separated by newline or semicolon
 * - Pipelines (command | command | ...)
 */

import { Effect } from 'effect';
import { SourceSpan } from '../lexer/position';
import { TokenKind } from '../lexer/token';
import {
	LiteralPart,
	Pipeline,
	Program,
	Redirection,
	SimpleCommand,
	Statement,
	type StatementChainMode,
	Word,
} from './ast';
import type { CommandParser } from './command';
import type { Parser } from './parser';
import type { ParseSyntaxError } from './syntax-error';

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
		return Effect.runSync(this.parseScriptEffect());
	}

	parseScriptEffect(): Effect.Effect<Program, ParseSyntaxError> {
		const statementParser = this;
		return Effect.gen(function* () {
			const startPos = statementParser.parser.currentToken.span.start;
			const statements: Statement[] = [];

			// Ignore leading separators/comments and allow empty lines.
			statementParser.consumeSeparatorsAndComments();

			while (statementParser.parser.currentToken.kind !== TokenKind.EOF) {
				const statement = yield* statementParser.parseStatementEffect();
				if (!statement) {
					return yield* statementParser.parser.syntacticErrorEffect(
						'Expected command',
						'command'
					);
				}

				statements.push(statement);

				const sawSeparator =
					statementParser.consumeSeparatorsAndComments();
				if (
					(statementParser.parser.currentToken.kind as TokenKind) !==
						TokenKind.EOF &&
					!sawSeparator
				) {
					return yield* statementParser.parser.syntacticErrorEffect(
						'Expected statement separator',
						'newline or ;'
					);
				}
			}

			const endPos = statementParser.parser.previousTokenPosition;
			return new Program(new SourceSpan(startPos, endPos), statements);
		});
	}

	/**
	 * Parse a single statement.
	 */
	parseStatement(): Statement | null {
		return Effect.runSync(this.parseStatementEffect());
	}

	parseStatementEffect(): Effect.Effect<Statement | null, ParseSyntaxError> {
		const statementParser = this;
		return Effect.gen(function* () {
			let chainMode: StatementChainMode = 'always';
			const currentToken = statementParser.parser.currentToken;
			if (
				!currentToken.isQuoted &&
				statementParser.isChainKeyword(currentToken.spelling)
			) {
				chainMode = currentToken.spelling === 'and' ? 'and' : 'or';
				statementParser.parser.advance();
			}

			const pipeline = yield* statementParser.parsePipelineEffect();
			if (!pipeline) {
				return null;
			}

			return new Statement(pipeline.span, pipeline, chainMode);
		});
	}

	/**
	 * Parse a pipeline.
	 *
	 * Grammar:
	 *   pipeline ::= command ('|' command)*
	 */
	parsePipeline(): Pipeline | null {
		return Effect.runSync(this.parsePipelineEffect());
	}

	parsePipelineEffect(): Effect.Effect<Pipeline | null, ParseSyntaxError> {
		const statementParser = this;
		return Effect.gen(function* () {
			const startPos = statementParser.parser.currentToken.span.start;

			// Parse first command
			const firstCommand =
				yield* statementParser.commandParser.parseCommandEffect();
			if (!firstCommand) {
				return null;
			}

			const commands: SimpleCommand[] = [firstCommand];

			// Parse remaining commands in pipeline
			while (
				statementParser.parser.currentToken.kind === TokenKind.PIPE
			) {
				const pipeToken = statementParser.parser.currentToken;
				const previousCommand = commands.at(-1);
				if (previousCommand) {
					const rewrittenPreviousCommand =
						statementParser.rewriteStderrPipeCommand(
							previousCommand,
							pipeToken.span.start.offset,
							pipeToken.span
						);
					if (rewrittenPreviousCommand !== previousCommand) {
						commands[commands.length - 1] =
							rewrittenPreviousCommand;
					}
				}
				statementParser.parser.advance(); // consume |

				// Skip any newlines after pipe (line continuation)
				statementParser.skipNewlines();
				const tokenAfterPipe = statementParser.parser.currentToken;
				if (
					tokenAfterPipe.kind === TokenKind.WORD &&
					tokenAfterPipe.spelling === '&'
				) {
					return yield* statementParser.parser.syntacticErrorEffect(
						'Invalid fish pipeline operator',
						'command after | (|& is unsupported; use &|)'
					);
				}

				const command =
					yield* statementParser.commandParser.parseCommandEffect();
				if (!command) {
					return yield* statementParser.parser.syntacticErrorEffect(
						'Expected command after |',
						'command'
					);
				}

				commands.push(command);
			}

			const endPos = statementParser.parser.previousTokenPosition;
			const span = new SourceSpan(startPos, endPos);

			return new Pipeline(span, commands);
		});
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

	private rewriteStderrPipeCommand(
		command: SimpleCommand,
		pipeStartOffset: number,
		pipeSpan: SourceSpan
	): SimpleCommand {
		const trailingArg = command.args.at(-1);
		if (
			!(
				trailingArg &&
				!trailingArg.quoted &&
				trailingArg.literalValue === '&' &&
				trailingArg.span.end.offset === pipeStartOffset
			)
		) {
			return command;
		}

		const updatedArgs = command.args.slice(0, -1);
		const pipeTarget = this.createLiteralWord('|', pipeSpan);
		const updatedRedirections = [
			...command.redirections,
			new Redirection(pipeSpan, 'output', pipeTarget, {
				mode: 'pipe',
				sourceFd: 1,
			}),
			new Redirection(pipeSpan, 'output', pipeTarget, {
				mode: 'pipe',
				sourceFd: 2,
			}),
		];
		return new SimpleCommand(
			command.span,
			command.name,
			updatedArgs,
			updatedRedirections
		);
	}

	private createLiteralWord(literal: string, span: SourceSpan): Word {
		return new Word(span, [new LiteralPart(span, literal)]);
	}
}
