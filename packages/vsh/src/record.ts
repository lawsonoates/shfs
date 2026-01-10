export type FileRecord = { kind: 'file'; path: string };
export type LineRecord = {
	kind: 'line';
	text: string;
	file?: string;
	lineNum?: number;
};
export type JsonRecord = { kind: 'json'; value: unknown };

/**
 * Record is the unit of data flowing through pipelines.
 * Commands operate on records, not bytes.
 */
export type Record = FileRecord | LineRecord | JsonRecord;
