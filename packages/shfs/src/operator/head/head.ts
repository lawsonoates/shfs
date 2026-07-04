import { Result } from 'better-result';

import { isDirectoryRecord } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type { FileRecord, LineRecord } from '../../record';
import type { Stream } from '../../stream';
import type { Transducer } from '../types';

export interface FileEntry {
	displayPath: string;
	path: string;
}

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

export async function* headFiles(
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
		if (printHeaders) {
			if (printedAny) {
				yield { kind: 'line', text: '' };
			}
			yield { kind: 'line', text: `==> ${entry.displayPath} <==` };
		}
		printedAny = true;
		let lineNum = 0;
		for await (const text of fs.readLines(entry.path)) {
			if (lineNum >= n) {
				break;
			}
			yield {
				file: entry.path,
				kind: 'line',
				lineNum: ++lineNum,
				text,
			};
		}
	}
}
