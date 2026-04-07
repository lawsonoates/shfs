import type { FS } from '../fs/fs';
import {
	type FileRecord,
	formatRecord as formatShellRecord,
	type LineRecord,
	type Record as ShellRecord,
} from '../record';
import type { Stream } from '../stream';

export async function* toLineStream(
	fs: FS,
	input: Stream<ShellRecord>
): Stream<LineRecord> {
	for await (const record of input) {
		if (record.kind === 'line') {
			yield record;
			continue;
		}
		if (record.kind === 'file') {
			yield* fileRecordToLines(fs, record);
			continue;
		}
		yield {
			kind: 'line',
			text: JSON.stringify(record.value),
		};
	}
}

/**
 * Converts any ShellRecord stream into LineRecords by formatting each record
 * as its display text. Unlike `toLineStream`, this does NOT read file contents —
 * FileRecords are rendered as their path, which is the correct behavior for
 * line-oriented transducers (tail, head) receiving piped input from commands
 * like `find` that produce path listings.
 */
export async function* toFormattedLineStream(
	input: Stream<ShellRecord>
): Stream<LineRecord> {
	for await (const record of input) {
		if (record.kind === 'line') {
			yield record;
			continue;
		}
		yield {
			kind: 'line',
			text: formatShellRecord(record),
		};
	}
}

export async function* fileRecordToLines(
	fs: FS,
	record: FileRecord
): Stream<LineRecord> {
	if (await isDirectoryRecord(fs, record)) {
		return;
	}

	let lineNum = 1;
	for await (const text of fs.readLines(record.path)) {
		yield {
			kind: 'line',
			text,
			file: record.path,
			lineNum: lineNum++,
		};
	}
}

export async function isDirectoryRecord(
	fs: FS,
	record: FileRecord
): Promise<boolean> {
	if (record.isDirectory !== undefined) {
		return record.isDirectory;
	}

	try {
		return (await fs.stat(record.path)).isDirectory;
	} catch {
		return false;
	}
}

export function formatRecord(record: ShellRecord): string {
	return formatShellRecord(record);
}
