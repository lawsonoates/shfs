/**
 * Represents a position in source code.
 */
export class SourcePosition {
	readonly line: number;
	readonly column: number;
	readonly offset: number;

	constructor(line: number, column: number, offset: number) {
		this.line = line;
		this.column = column;
		this.offset = offset;
	}

	static readonly ZERO = new SourcePosition(1, 1, 0);

	toString(): string {
		return `${this.line}:${this.column}`;
	}

	span(end: SourcePosition): SourceSpan {
		return new SourceSpan(this, end);
	}
}

/**
 * Represents a span of source code from start to end position.
 */
export class SourceSpan {
	readonly start: SourcePosition;
	readonly end: SourcePosition;

	constructor(start: SourcePosition, end: SourcePosition) {
		this.start = start;
		this.end = end;
	}

	toString(): string {
		return `${this.start}-${this.end}`;
	}
}
