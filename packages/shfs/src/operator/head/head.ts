import type { FS } from '../../fs/fs';
import type { FileRecord, LineRecord } from '../../record';
import type { Transducer } from '../types';

export function head(fs: FS): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const file of input) {
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
