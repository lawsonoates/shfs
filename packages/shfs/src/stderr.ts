export interface OutputStream {
	append(line: string): void;
	appendLines(lines: readonly string[]): void;
	snapshot(): readonly string[];
}

export interface StderrSink {
	stderr: OutputStream;
}

export class BufferedOutputStream implements OutputStream {
	private readonly lines: string[] = [];

	append(line: string): void {
		this.lines.push(line);
	}

	appendLines(lines: readonly string[]): void {
		for (const line of lines) {
			this.append(line);
		}
	}

	snapshot(): readonly string[] {
		return [...this.lines];
	}
}

export class NullOutputStream implements OutputStream {
	append(_line: string): void {
		// drop output
	}

	appendLines(_lines: readonly string[]): void {
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
