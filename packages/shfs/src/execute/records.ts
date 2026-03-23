import type { FS } from '../fs/fs';
import {
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
			let lineNum = 1;
			for await (const text of fs.readLines(record.path)) {
				yield {
					kind: 'line',
					text,
					file: record.path,
					lineNum: lineNum++,
				};
			}
			continue;
		}
		yield {
			kind: 'line',
			text: JSON.stringify(record.value),
		};
	}
}

export function formatRecord(record: ShellRecord): string {
	return formatShellRecord(record);
}
