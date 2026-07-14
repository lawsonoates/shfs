import { Result } from 'better-result';

import { readFileRecordBytes } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type {
	ByteRecord,
	FileRecord,
	LineRecord,
	Record as ShellRecord,
} from '../../record';
import type { Stream } from '../../stream';
import type { Transducer } from '../types';

export interface FileEntry {
	displayPath: string;
	path: string;
}

const NEWLINE_BYTE = 0x0a;

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

function takeHeadLines(bytes: Uint8Array, count: number): Uint8Array {
	if (count <= 0) {
		return new Uint8Array();
	}
	let newlines = 0;
	for (const [index, byte] of bytes.entries()) {
		if (byte !== NEWLINE_BYTE) {
			continue;
		}
		newlines += 1;
		if (newlines === count) {
			return bytes.slice(0, index + 1);
		}
	}
	return bytes;
}

function byteRecord(bytes: Uint8Array): ByteRecord | null {
	return bytes.length > 0 ? { bytes, kind: 'bytes' } : null;
}

export function head(fs: FS): Transducer<FileRecord, ByteRecord> {
	return async function* (input) {
		for await (const file of input) {
			const bytes = await readFileRecordBytes(fs, file);
			const selected = bytes && byteRecord(takeHeadLines(bytes, 10));
			if (selected) {
				yield selected;
			}
		}
	};
}

export async function* headFiles(
	fs: FS,
	n: number,
	entries: readonly FileEntry[],
	onMissingFile: (displayPath: string) => void
): Stream<ShellRecord> {
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
		const bytes = await readFileRecordBytes(fs, {
			isDirectory: false,
			kind: 'file',
			path: entry.path,
		});
		const selected = bytes && byteRecord(takeHeadLines(bytes, n));
		if (selected) {
			yield selected;
		}
	}
}
