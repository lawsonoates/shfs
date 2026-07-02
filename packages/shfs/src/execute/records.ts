import { Effect } from 'effect';

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
 * Converts records into stdin-style line text. Unlike `toLineStream`, this does
 * not read FileRecord contents. FileRecords are rendered as paths, matching the
 * shell pipe boundary where downstream line-oriented commands consume text.
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

	return Effect.runPromise(
		Effect.tryPromise({
			try: () => fs.stat(record.path),
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onFailure: () => false,
				onSuccess: (stat) => stat.isDirectory,
			})
		)
	);
}

export function formatRecord(record: ShellRecord): string {
	return formatShellRecord(record);
}
