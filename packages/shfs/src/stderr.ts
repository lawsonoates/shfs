export interface OutputStream {
	/** Append a complete diagnostic line. */
	append(line: string): void;
	appendLines(lines: readonly string[]): void;
	/** Append exact physical text without implying a line terminator. */
	appendText(text: string): void;
	snapshot(): readonly string[];
}

export interface StderrSink {
	stderr: OutputStream;
}

export class BufferedOutputStream implements OutputStream {
	private readonly chunks: string[] = [];
	private hasOutput = false;
	private needsLineSeparator = false;

	append(line: string): void {
		if (this.needsLineSeparator) {
			this.chunks.push('\n');
		}
		this.chunks.push(line);
		this.hasOutput = true;
		this.needsLineSeparator = true;
	}

	appendLines(lines: readonly string[]): void {
		for (const line of lines) {
			this.append(line);
		}
	}

	appendText(text: string): void {
		if (text === '') {
			return;
		}
		if (this.needsLineSeparator) {
			this.chunks.push('\n');
		}
		this.chunks.push(text);
		this.hasOutput = true;
		this.needsLineSeparator = false;
	}

	snapshot(): readonly string[] {
		return this.hasOutput ? this.chunks.join('').split('\n') : [];
	}
}

export class NullOutputStream implements OutputStream {
	append(_line: string): void {
		// drop output
	}

	appendLines(_lines: readonly string[]): void {
		// drop output
	}

	appendText(_text: string): void {
		// drop output
	}

	snapshot(): readonly string[] {
		return [];
	}
}

export function appendStderrLines(
	context: StderrSink,
	lines: readonly string[]
): void {
	context.stderr.appendLines(lines);
}

export function formatStderr(lines: readonly string[]): string {
	return lines.join('\n');
}
