import { SourcePosition } from './position';

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
