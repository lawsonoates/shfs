import { Result } from 'better-result';

import { fileRecordToLines } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type { LineRecord } from '../../record';
import type { Stream } from '../../stream';
import type { FileEntry } from '../head/head';
import type { Transducer } from '../types';

export function tail(n: number): Transducer<LineRecord, LineRecord> {
	return async function* (input) {
		const buf: LineRecord[] = [];
		for await (const x of input) {
			buf.push(x);
			if (buf.length > n) {
				buf.shift();
			}
		}
		yield* buf;
	};
}

export async function* tailFiles(
	fs: FS,
	n: number,
	entries: readonly FileEntry[],
	onMissingFile: (displayPath: string) => void
): Stream<LineRecord> {
	const printHeaders = entries.length > 1;
	let printedAny = false;
	for (const entry of entries) {
		const stat = await Result.tryPromise({
			try: () => fs.stat(entry.path),
			catch: (error) => error,
		});
		if (Result.isError(stat)) {
			onMissingFile(entry.displayPath);
			continue;
		}
		if (stat.value.type === 'Directory') {
			continue;
		}
		const buf: LineRecord[] = [];
		for await (const line of fileRecordToLines(fs, {
			isDirectory: false,
			kind: 'file',
			path: entry.path,
		})) {
			buf.push(line);
			if (buf.length > n) {
				buf.shift();
			}
		}
		if (printHeaders) {
			if (printedAny) {
				yield { kind: 'line', text: '' };
			}
			yield { kind: 'line', text: `==> ${entry.displayPath} <==` };
		}
		printedAny = true;
		yield* buf;
	}
}
