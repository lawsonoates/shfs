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
}
export interface JsonRecord {
	kind: 'json';
	value: unknown;
}

/**
 * Record is the unit of data flowing through pipelines.
 * Commands operate on records, not bytes.
 */
export type Record = FileRecord | LineRecord | JsonRecord;

export function formatRecord(record: Record): string {
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
