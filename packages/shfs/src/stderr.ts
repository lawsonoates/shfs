export interface OutputStreamSnapshot {
	bytes: Uint8Array;
	hasOutput: boolean;
	needsLineSeparator: boolean;
}

export interface OutputStream {
	/** Append a complete diagnostic line. */
	append(line: string): void;
	/** Append exact physical bytes without implying a line terminator. */
	appendBytes(bytes: Uint8Array): void;
	appendLines(lines: readonly string[]): void;
	/** Append another stream while preserving its logical final-line state. */
	appendSnapshot(snapshot: OutputStreamSnapshot): void;
	/** Append exact physical text without implying a line terminator. */
	appendText(text: string): void;
	snapshot(): readonly string[];
	snapshotOutput(): OutputStreamSnapshot;
}

export interface StderrSink {
	stderr: OutputStream;
}

export class BufferedOutputStream implements OutputStream {
	private readonly chunks: Uint8Array[] = [];
	private hasOutput = false;
	private length = 0;
	private needsLineSeparator = false;

	append(line: string): void {
		this.appendPhysicalBytes(UTF8_ENCODER.encode(line), true);
		this.needsLineSeparator = true;
	}

	appendBytes(bytes: Uint8Array): void {
		this.appendPhysicalBytes(bytes, false);
	}

	appendLines(lines: readonly string[]): void {
		for (const line of lines) {
			this.append(line);
		}
	}

	appendSnapshot(snapshot: OutputStreamSnapshot): void {
		if (!snapshot.hasOutput) {
			return;
		}
		this.appendPhysicalBytes(snapshot.bytes, true);
		this.needsLineSeparator = snapshot.needsLineSeparator;
	}

	appendText(text: string): void {
		if (text === '') {
			return;
		}
		this.appendBytes(UTF8_ENCODER.encode(text));
	}

	snapshot(): readonly string[] {
		return this.hasOutput
			? UTF8_DECODER.decode(this.snapshotOutput().bytes).split('\n')
			: [];
	}

	snapshotOutput(): OutputStreamSnapshot {
		const bytes = new Uint8Array(this.length);
		let offset = 0;
		for (const chunk of this.chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		return {
			bytes,
			hasOutput: this.hasOutput,
			needsLineSeparator: this.needsLineSeparator,
		};
	}

	private appendPhysicalBytes(
		bytes: Uint8Array,
		preserveEmpty: boolean
	): void {
		if (bytes.length === 0 && !preserveEmpty) {
			return;
		}
		if (this.needsLineSeparator) {
			this.pushChunk(NEWLINE_BYTES);
		}
		this.pushChunk(bytes);
		this.hasOutput = true;
		this.needsLineSeparator = false;
	}

	private pushChunk(bytes: Uint8Array): void {
		if (bytes.length === 0) {
			return;
		}
		const chunk = new Uint8Array(bytes);
		this.chunks.push(chunk);
		this.length += chunk.length;
	}
}

export class NullOutputStream implements OutputStream {
	append(_line: string): void {
		// drop output
	}

	appendBytes(_bytes: Uint8Array): void {
		// drop output
	}

	appendLines(_lines: readonly string[]): void {
		// drop output
	}

	appendSnapshot(_snapshot: OutputStreamSnapshot): void {
		// drop output
	}

	appendText(_text: string): void {
		// drop output
	}

	snapshot(): readonly string[] {
		return [];
	}

	snapshotOutput(): OutputStreamSnapshot {
		return {
			bytes: new Uint8Array(),
			hasOutput: false,
			needsLineSeparator: false,
		};
	}
}

const NEWLINE_BYTES = new Uint8Array([0x0a]);
const UTF8_DECODER = new TextDecoder();
const UTF8_ENCODER = new TextEncoder();

export function appendStderrLines(
	context: StderrSink,
	lines: readonly string[]
): void {
	context.stderr.appendLines(lines);
}

export function formatStderr(lines: readonly string[]): string {
	return lines.join('\n');
}
