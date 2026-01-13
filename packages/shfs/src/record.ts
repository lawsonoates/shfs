export interface FileRecord {
	kind: 'file';
	path: string;
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
