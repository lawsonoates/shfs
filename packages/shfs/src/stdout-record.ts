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
 * Commands operate on records, not bytes.
 */
export type StdoutRecord = FileRecord | LineRecord | JsonRecord;

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

export function formatStdoutRecord(record: StdoutRecord): string {
	switch (record.kind) {
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

export function formatStdoutRecords(
	records: readonly StdoutRecord[],
	options: { trailingNewline?: boolean } = {}
): string {
	let text = '';
	for (const record of records) {
		text += formatStdoutRecord(record);
		if (record.kind !== 'line' || record.terminated !== false) {
			text += '\n';
		}
	}
	if (options.trailingNewline || !text.endsWith('\n')) {
		return text;
	}
	return text.slice(0, -1);
}
