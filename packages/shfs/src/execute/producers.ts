import type { FS } from '../fs/fs';
import type { Transducer } from '../operator/types';
import type { FileRecord, LineRecord } from '../record';
import type { Stream } from '../stream';

export function lines(fs: FS): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const f of input) {
			let lineNum = 1;
			for await (const line of fs.readLines(f.path)) {
				yield {
					file: f.path,
					kind: 'line',
					lineNum: lineNum++,
					text: line,
				};
			}
		}
	};
}

export async function* files(...paths: string[]): Stream<FileRecord> {
	for (const path of paths) {
		yield { kind: 'file', path };
	}
}
