/**
 * Command parser for the Fish subset parser.
 *
 * Handles parsing of commands:
 * - Simple commands (name + args)
 * - Redirections (< > Phase 2)
 */

import { SourceSpan } from '../lexer/position';
import { TokenKind } from '../lexer/token';
import { LiteralPart, Redirection, SimpleCommand, Word } from './ast';
import type { Parser } from './parser';
import type { WordParser } from './word';

const DIGITS_ONLY_REGEX = /^[0-9]+$/;

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
		const normalized = this.normalizeRedirectionPrefixes(
			args,
			redirections
		);

		return new SimpleCommand(
			span,
			name,
			normalized.args,
			normalized.redirections
		);
	}

	/**
	 * Parse a redirection if present.
	 *
	 * Grammar (subset):
	 *   redirection ::= '<' word | '>' word | '>>' word
	 *
	 * This parser also supports fish-inspired forms consumed by shfs specs:
	 *   <&3, <&-, <?file, >&2, >&-, 2>|, >?file, >>?file.
	 */
	parseRedirection(): Redirection | null {
		const token = this.parser.currentToken;
		if (token.kind === TokenKind.LESS) {
			return this.parseInputRedirection(token);
		}
		if (token.kind === TokenKind.GREAT) {
			return this.parseOutputRedirection(token);
		}

		return null;
	}

	private parseInputRedirection(token: { span: SourceSpan }): Redirection {
		const startPos = token.span.start;
		this.parser.advance();
		this.validateInputTargetPrefix();

		const parsedTarget = this.parseInputTargetAfterLess();
		const fdMode = this.parseFdMode(parsedTarget.target, '<&N or <&-');
		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);
		return new Redirection(span, 'input', parsedTarget.target, {
			mode: fdMode.mode,
			optional: parsedTarget.optional,
			targetFd: fdMode.targetFd,
		});
	}

	private parseOutputRedirection(token: { span: SourceSpan }): Redirection {
		const startPos = token.span.start;
		this.parser.advance();

		const append = this.consumeAppendMarker();
		const noclobber = this.consumeNoclobberMarker();

		if (this.parser.currentToken.kind === TokenKind.PIPE) {
			const pipeToken = this.parser.currentToken;
			return new Redirection(
				new SourceSpan(startPos, this.parser.previousTokenPosition),
				'output',
				this.createLiteralWord('|', pipeToken.span),
				{
					append,
					mode: 'pipe',
					noclobber,
				}
			);
		}

		const target = this.wordParser.parseWord();
		if (!target) {
			this.parser.syntacticError('Expected filename after >', 'word');
		}
		const fdMode = this.parseFdMode(target, '>&N or >&-');
		const endPos = this.parser.previousTokenPosition;
		const span = new SourceSpan(startPos, endPos);
		return new Redirection(span, 'output', target, {
			append,
			mode: fdMode.mode,
			noclobber,
			targetFd: fdMode.targetFd,
		});
	}

	private validateInputTargetPrefix(): void {
		if (this.parser.currentToken.kind !== TokenKind.WORD) {
			return;
		}
		const spelling = this.parser.currentToken.spelling;
		if (spelling.startsWith('?&') || spelling.startsWith('&?')) {
			this.parser.syntacticError(
				'Invalid redirection target after <',
				'<path, <?path, <&N, or <&-'
			);
		}
	}

	private parseInputTargetAfterLess(): { optional: boolean; target: Word } {
		let optional = false;
		let target = this.wordParser.parseWord();
		if (!target) {
			this.parser.syntacticError('Expected filename after <', 'word');
		}
		const targetLiteral = target.literalValue;
		if (!targetLiteral?.startsWith('?')) {
			return { optional, target };
		}
		optional = true;
		if (targetLiteral === '?') {
			const explicitTarget = this.wordParser.parseWord();
			if (!explicitTarget) {
				this.parser.syntacticError(
					'Expected filename after <?',
					'word'
				);
			}
			target = explicitTarget;
			return { optional, target };
		}
		target = this.cloneLiteralWord(target, targetLiteral.slice(1));
		return { optional, target };
	}

	private consumeAppendMarker(): boolean {
		if (this.parser.currentToken.kind !== TokenKind.GREAT) {
			return false;
		}
		this.parser.advance();
		return true;
	}

	private consumeNoclobberMarker(): boolean {
		if (
			this.parser.currentToken.kind !== TokenKind.WORD ||
			this.parser.currentToken.spelling !== '?'
		) {
			return false;
		}
		this.parser.advance();
		return true;
	}

	private parseFdMode(
		target: Word,
		expected: string
	): { mode: Redirection['mode']; targetFd: number | null } {
		const targetLiteral = target.literalValue;
		if (!targetLiteral?.startsWith('&')) {
			return { mode: 'file', targetFd: null };
		}

		const fdTarget = targetLiteral.slice(1);
		if (fdTarget === '-') {
			return { mode: 'close', targetFd: null };
		}
		if (DIGITS_ONLY_REGEX.test(fdTarget)) {
			return { mode: 'fd', targetFd: Number(fdTarget) };
		}
		this.parser.syntacticError(
			'Invalid file descriptor duplication target',
			expected
		);
	}

	/**
	 * Check if current token terminates a command.
	 */
	private isCommandTerminator(): boolean {
		const kind = this.parser.currentToken.kind;
		return (
			kind === TokenKind.PIPE ||
			kind === TokenKind.SEMICOLON ||
			kind === TokenKind.NEWLINE ||
			kind === TokenKind.EOF
		);
	}

	private cloneLiteralWord(word: Word, literal: string): Word {
		return new Word(
			word.span,
			[new LiteralPart(word.span, literal)],
			word.quoted
		);
	}

	private createLiteralWord(literal: string, span: SourceSpan): Word {
		return new Word(span, [new LiteralPart(span, literal)]);
	}

	private cloneRedirection(
		redirection: Redirection,
		options: {
			sourceFd?: number;
			mode?: Redirection['mode'];
		}
	): Redirection {
		return new Redirection(
			redirection.span,
			redirection.redirectKind,
			redirection.target,
			{
				append: redirection.append,
				mode: options.mode ?? redirection.mode,
				noclobber: redirection.noclobber,
				optional: redirection.optional,
				sourceFd: options.sourceFd ?? redirection.sourceFd,
				targetFd: redirection.targetFd,
			}
		);
	}

	private normalizeRedirectionPrefixes(
		args: Word[],
		redirections: Redirection[]
	): { args: Word[]; redirections: Redirection[] } {
		if (args.length === 0 || redirections.length === 0) {
			return { args, redirections };
		}

		const consumedPrefixArgIndices = new Set<number>();
		const normalizedRedirections: Redirection[] = [];

		for (const redirection of redirections) {
			const prefixArgIndex = this.findContiguousPrefixArgIndex(
				args,
				consumedPrefixArgIndices,
				redirection.span.start.offset
			);
			if (prefixArgIndex === null) {
				normalizedRedirections.push(redirection);
				continue;
			}
			const prefixArg = args[prefixArgIndex];
			if (prefixArg?.quoted) {
				normalizedRedirections.push(redirection);
				continue;
			}
			const prefixLiteral = prefixArg?.literalValue;
			if (!prefixLiteral) {
				normalizedRedirections.push(redirection);
				continue;
			}
			if (
				prefixLiteral === '&' &&
				redirection.redirectKind === 'output'
			) {
				consumedPrefixArgIndices.add(prefixArgIndex);
				normalizedRedirections.push(
					this.cloneRedirection(redirection, { sourceFd: 1 }),
					this.cloneRedirection(redirection, { sourceFd: 2 })
				);
				continue;
			}
			if (DIGITS_ONLY_REGEX.test(prefixLiteral)) {
				consumedPrefixArgIndices.add(prefixArgIndex);
				normalizedRedirections.push(
					this.cloneRedirection(redirection, {
						sourceFd: Number(prefixLiteral),
					})
				);
				continue;
			}
			normalizedRedirections.push(redirection);
		}

		const normalizedArgs = args.filter(
			(_arg, index) => !consumedPrefixArgIndices.has(index)
		);
		return { args: normalizedArgs, redirections: normalizedRedirections };
	}

	private findContiguousPrefixArgIndex(
		args: Word[],
		consumedPrefixArgIndices: Set<number>,
		redirectionStartOffset: number
	): number | null {
		for (let index = args.length - 1; index >= 0; index--) {
			if (consumedPrefixArgIndices.has(index)) {
				continue;
			}
			const arg = args[index];
			if (!arg) {
				continue;
			}
			if (arg.span.end.offset === redirectionStartOffset) {
				return index;
			}
		}
		return null;
	}
}
