import type { FS } from '../fs/fs';
import type { Producer, Transducer } from '../operator/types';
import type { FileRecord, LineRecord } from '../record';

export function lines(fs: FS): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const f of input) {
			let lineNum = 1;
			for await (const line of fs.readLines(f.path)) {
				yield { file: f.path, kind: 'line', lineNum: lineNum++, text: line };
			}
		}
	};
}

export function files(fs: FS, ...globs: string[]): Producer<FileRecord> {
	return async function* () {
		for (const glob of globs) {
			for await (const path of fs.list(glob)) {
				yield { kind: 'file', path };
			}
		}
	};
}
