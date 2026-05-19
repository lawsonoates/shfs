import { SourcePosition } from './position';
import { TokenKind, type TokenKind as TokenKindValue } from './token';

export interface SimpleWordRead {
	kind: TokenKindValue;
	spelling: string;
}

function isDigitCode(code: number): boolean {
	return code >= 48 && code <= 57;
}

function isNameStartCode(code: number): boolean {
	return (
		(code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
	);
}

function isNameContinueCode(code: number): boolean {
	return isNameStartCode(code) || isDigitCode(code) || code === 45;
}

/**
 * Interface for reading source code character by character.
 * Supports both in-memory and streaming implementations.
 */
export interface SourceReader {
	/** Whether we've reached the end of input */
	readonly eof: boolean;

	/** Current position in the source */
	readonly position: SourcePosition;

	/** Get current character without consuming (or character at offset) */
	peek(offset?: number): string;

	/** Consume and return current character */
	advance(): string;

	/** Mark current position for potential reset */
	mark(): void;

	/** Reset to last marked position */
	reset(): void;
}

/**
 * In-memory implementation of SourceReader (fast).
 */
export class StringSourceReader implements SourceReader {
	private static readonly EOF = '\0';
	private readonly input: string;
	private pos = 0;
	private line = 1;
	private column = 1;
	private markState: { pos: number; line: number; column: number } | null =
		null;

	constructor(input: string) {
		this.input = input;
	}

	get eof(): boolean {
		return this.pos >= this.input.length;
	}

	get position(): SourcePosition {
		return new SourcePosition(this.line, this.column, this.pos);
	}

	peek(offset = 0): string {
		const idx = this.pos + offset;
		const char = this.input[idx];
		return char !== undefined ? char : StringSourceReader.EOF;
	}

	advance(): string {
		if (this.eof) {
			return StringSourceReader.EOF;
		}

		const char = this.input[this.pos];
		if (char === undefined) {
			return StringSourceReader.EOF;
		}
		this.pos++;
		if (char === '\n') {
			this.line++;
			this.column = 1;
		} else {
			this.column++;
		}
		return char;
	}

	rewindTo(position: SourcePosition): void {
		this.pos = position.offset;
		this.line = position.line;
		this.column = position.column;
	}

	readSimpleWord(): SimpleWordRead {
		const start = this.pos;
		let kind: TokenKindValue = TokenKind.NUMBER;
		while (this.pos < this.input.length) {
			const code = this.input.charCodeAt(this.pos);
			if (
				code === 32 ||
				code === 9 ||
				code === 10 ||
				code === 124 ||
				code === 59 ||
				code === 60 ||
				code === 62 ||
				code === 40 ||
				code === 41 ||
				code === 34 ||
				code === 39 ||
				code === 92 ||
				code === 42 ||
				code === 63 ||
				code === 91 ||
				code === 35
			) {
				break;
			}

			if (kind !== TokenKind.WORD) {
				const offset = this.pos - start;
				if (kind === TokenKind.NUMBER) {
					if (!isDigitCode(code)) {
						kind = offset === 0 && isNameStartCode(code) ? TokenKind.NAME : TokenKind.WORD;
					}
				} else if (!isNameContinueCode(code)) {
					kind = TokenKind.WORD;
				}
			}
			this.pos++;
		}

		const spelling = this.input.slice(start, this.pos);
		this.column += spelling.length;
		return {
			kind: spelling.length === 0 ? TokenKind.WORD : kind,
			spelling,
		};
	}

	mark(): void {
		this.markState = {
			pos: this.pos,
			line: this.line,
			column: this.column,
		};
	}

	reset(): void {
		if (this.markState) {
			this.pos = this.markState.pos;
			this.line = this.markState.line;
			this.column = this.markState.column;
			this.markState = null;
		}
	}
}
