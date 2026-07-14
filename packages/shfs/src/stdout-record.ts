export interface ByteRecord {
	/** Exact physical stdout bytes, including any delimiters or newlines. */
	bytes: Uint8Array;
	kind: 'bytes';
}

export interface FileRecord {
	kind: 'file';
	isDirectory?: boolean;
	path: string;
	displayPath?: string;
}

export interface LineRecord {
	kind: 'line';
	text: string;
	file?: string;
	lineNum?: number;
	/** Preserve this record as one command-substitution value. */
	separation?: 'explicit';
	/** Whether this record ends with a newline. Omitted means true. */
	terminated?: false;
}

export interface JsonRecord {
	kind: 'json';
	value: unknown;
}

/**
 * Stdout records are the unit of data flowing through pipelines.
 * Records carry either logical values or exact physical byte chunks.
 */
export type StdoutRecord = ByteRecord | FileRecord | LineRecord | JsonRecord;

const NEWLINE_BYTE = 0x0a;
const UTF8_DECODER = new TextDecoder();
const UTF8_ENCODER = new TextEncoder();

/** Convert physical text lines into records, preserving final-line termination. */
export function textToLineRecords(
	text: string,
	terminated: boolean
): LineRecord[] {
	if (text === '' && !terminated) {
		return [];
	}
	const lines = text.split('\n');
	const endsWithNewline = text.endsWith('\n');
	if (!terminated && endsWithNewline) {
		lines.pop();
	}
	return lines.map((line, index) => {
		const isUnterminatedFinalLine =
			!(terminated || endsWithNewline) && index === lines.length - 1;
		return isUnterminatedFinalLine
			? { kind: 'line', terminated: false, text: line }
			: { kind: 'line', text: line };
	});
}

class PhysicalLineDecoder {
	private decodingBytes = false;
	private pendingLine: LineRecord | undefined;
	private readonly utf8Decoder = new TextDecoder();

	push(record: StdoutRecord): LineRecord[] {
		if (record.kind === 'bytes') {
			this.decodingBytes = true;
			return this.appendPhysicalText(
				this.utf8Decoder.decode(record.bytes, { stream: true })
			);
		}

		const lines = this.flushByteDecoder();
		const line =
			record.kind === 'line'
				? record
				: { kind: 'line' as const, text: formatStdoutRecord(record) };
		if (line.separation === 'explicit') {
			if (this.pendingLine) {
				lines.push(this.takePendingLine(false));
			}
			lines.push(line);
			return lines;
		}
		lines.push(...this.appendPhysicalText(line.text, line));
		if (line.terminated !== false) {
			lines.push(this.takePendingLine(true, line));
		}
		return lines;
	}

	finish(): LineRecord[] {
		const lines = this.flushByteDecoder();
		if (this.pendingLine) {
			lines.push(this.takePendingLine(false));
		}
		return lines;
	}

	private appendPhysicalText(
		text: string,
		template?: LineRecord
	): LineRecord[] {
		const lines: LineRecord[] = [];
		let start = 0;
		let newlineIndex = text.indexOf('\n');
		while (newlineIndex !== -1) {
			this.appendSegment(text.slice(start, newlineIndex), template);
			lines.push(this.takePendingLine(true, template));
			start = newlineIndex + 1;
			newlineIndex = text.indexOf('\n', start);
		}
		if (start < text.length) {
			this.appendSegment(text.slice(start), template);
		}
		return lines;
	}

	private appendSegment(text: string, template?: LineRecord): void {
		if (!this.pendingLine) {
			this.pendingLine = template
				? { ...template, terminated: false, text: '' }
				: { kind: 'line', terminated: false, text: '' };
		}
		this.pendingLine.text += text;
	}

	private flushByteDecoder(): LineRecord[] {
		if (!this.decodingBytes) {
			return [];
		}
		this.decodingBytes = false;
		return this.appendPhysicalText(this.utf8Decoder.decode());
	}

	private takePendingLine(
		terminated: boolean,
		fallback?: LineRecord
	): LineRecord {
		const line = this.pendingLine ?? {
			...(fallback ?? { kind: 'line' as const }),
			text: '',
		};
		this.pendingLine = undefined;
		if (!terminated) {
			return { ...line, terminated: false };
		}
		const completed = { ...line };
		completed.terminated = undefined;
		return completed;
	}
}

/** Decode ordered physical stdout into lines across record boundaries. */
export async function* toPhysicalLineRecords(
	records: AsyncIterable<StdoutRecord>
): AsyncGenerator<LineRecord> {
	const decoder = new PhysicalLineDecoder();
	for await (const record of records) {
		for (const line of decoder.push(record)) {
			yield line;
		}
	}
	for (const line of decoder.finish()) {
		yield line;
	}
}

export function formatStdoutRecord(record: StdoutRecord): string {
	switch (record.kind) {
		case 'bytes':
			return UTF8_DECODER.decode(record.bytes);
		case 'line':
			return record.text;
		case 'file':
			return record.displayPath ?? record.path;
		case 'json':
			return JSON.stringify(record.value);
		default:
			throw new Error('Unknown record kind');
	}
}

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
	let length = 0;
	for (const chunk of chunks) {
		length += chunk.length;
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}

/** Serialize records to their physical stdout byte representation. */
export function recordsToBytes(
	records: readonly StdoutRecord[],
	options: { trailingNewline?: boolean } = {}
): Uint8Array {
	const chunks: Uint8Array[] = [];
	let finalBytesAreByteOwned = false;
	for (const record of records) {
		if (record.kind === 'bytes') {
			chunks.push(record.bytes);
			if (record.bytes.length > 0) {
				finalBytesAreByteOwned = true;
			}
			continue;
		}
		const text = formatStdoutRecord(record);
		const terminated =
			record.kind !== 'line' || record.terminated !== false;
		const chunk = UTF8_ENCODER.encode(terminated ? `${text}\n` : text);
		chunks.push(chunk);
		if (chunk.length > 0) {
			finalBytesAreByteOwned = false;
		}
	}
	const bytes = concatenateBytes(chunks);
	if (
		options.trailingNewline ||
		finalBytesAreByteOwned ||
		bytes.length === 0 ||
		bytes.at(-1) !== NEWLINE_BYTE
	) {
		return bytes;
	}
	return bytes.slice(0, -1);
}

export function formatStdoutRecords(
	records: readonly StdoutRecord[],
	options: { trailingNewline?: boolean } = {}
): string {
	const text = UTF8_DECODER.decode(
		recordsToBytes(records, { trailingNewline: true })
	);
	if (options.trailingNewline || !text.endsWith('\n')) {
		return text;
	}
	return text.slice(0, -1);
}
