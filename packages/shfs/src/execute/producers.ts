import type { FS } from '../fs/fs';
import type { Transducer } from '../operator/types';
import type { FileRecord, LineRecord } from '../record';
import type { Stream } from '../stream';
import { fileRecordToLines } from './records';

export function lines(fs: FS): Transducer<FileRecord, LineRecord> {
	return async function* (input) {
		for await (const f of input) {
			yield* fileRecordToLines(fs, f);
		}
	};
}

export async function* files(...paths: string[]): Stream<FileRecord> {
	for (const path of paths) {
		yield { kind: 'file', path };
	}
}
