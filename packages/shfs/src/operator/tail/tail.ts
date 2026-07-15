import { Result } from 'better-result';

import { readFileRecordBytes } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type {
	ByteRecord,
	LineRecord,
	Record as ShellRecord,
} from '../../record';
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

const NEWLINE_BYTE = 0x0a;

function takeTailLines(bytes: Uint8Array, count: number): Uint8Array {
	if (count <= 0 || bytes.length === 0) {
		return new Uint8Array();
	}
	let newlines = 0;
	const skipsTrailingTerminator = bytes.at(-1) === NEWLINE_BYTE;
	const lastIndex = bytes.length - (skipsTrailingTerminator ? 2 : 1);
	for (let index = lastIndex; index >= 0; index -= 1) {
		if (bytes[index] !== NEWLINE_BYTE) {
			continue;
		}
		newlines += 1;
		if (newlines === count) {
			return bytes.slice(index + 1);
		}
	}
	return bytes;
}

function byteRecord(bytes: Uint8Array): ByteRecord | null {
	return bytes.length > 0 ? { bytes, kind: 'bytes' } : null;
}

export async function* tailFiles(
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
		const bytes = await readFileRecordBytes(fs, {
			isDirectory: false,
			kind: 'file',
			path: entry.path,
		});
		if (printHeaders) {
			if (printedAny) {
				yield { kind: 'line', text: '' };
			}
			yield { kind: 'line', text: `==> ${entry.displayPath} <==` };
		}
		printedAny = true;
		const selected = bytes && byteRecord(takeTailLines(bytes, n));
		if (selected) {
			yield selected;
		}
	}
}
