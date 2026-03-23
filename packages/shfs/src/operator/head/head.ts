import { isDirectoryRecord } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type { FileRecord, LineRecord } from '../../record';
import type { Transducer } from '../types';

export function headLines(n: number): Transducer<LineRecord, LineRecord> {
	return async function* (input) {
		let emitted = 0;
		for await (const line of input) {
			if (emitted >= n) {
				break;
			}
			emitted++;
			yield line;
		}
	};
}

export function head(fs: FS): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const file of input) {
			if (await isDirectoryRecord(fs, file)) {
				continue;
			}
			let lineNum = 0;
			for await (const text of fs.readLines(file.path)) {
				if (lineNum >= 10) {
					break; // Default to 10 lines
				}
				yield {
					file: file.path,
					kind: 'line',
					lineNum: ++lineNum,
					text,
				};
			}
		}
	};
}

export function headWithN(
	fs: FS,
	n: number
): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const file of input) {
			if (await isDirectoryRecord(fs, file)) {
				continue;
			}
			let lineNum = 0;
			for await (const text of fs.readLines(file.path)) {
				if (lineNum >= n) {
					break;
				}
				yield {
					file: file.path,
					kind: 'line',
					lineNum: ++lineNum,
					text,
				};
			}
		}
	};
}
