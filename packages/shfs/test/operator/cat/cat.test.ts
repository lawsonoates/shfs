import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { cat } from '@/operator/cat/cat';
import {
	type FileRecord,
	recordsToBytes,
	type Record as ShellRecord,
} from '@/record';

const textDecoder = new TextDecoder();

test('cat replays file bytes', async () => {
	const fs = new MemoryFS();
	const filePath = '/test.txt';
	const fileContent = 'line1\nline2\nline3';

	fs.setFile(filePath, fileContent);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: filePath };
	}

	const records: ShellRecord[] = [];
	const transducer = cat(fs);
	for await (const record of transducer(createFileStream())) {
		records.push(record);
	}

	expect(
		textDecoder.decode(recordsToBytes(records, { trailingNewline: true }))
	).toBe(fileContent);
});

test('cat transforms physical lines across byte record boundaries', async () => {
	const fs = new MemoryFS();
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield { bytes: new Uint8Array([0x61]), kind: 'bytes' };
		yield { bytes: new Uint8Array([0x62, 0x0a]), kind: 'bytes' };
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(records).toEqual([{ kind: 'line', text: 'ab$' }]);
});

test('cat -E marks only terminated streamed lines', async () => {
	const fs = new MemoryFS();
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield {
			bytes: new TextEncoder().encode('terminated\nunterminated'),
			kind: 'bytes',
		};
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(records).toEqual([
		{ kind: 'line', terminated: undefined, text: 'terminated$' },
		{ kind: 'line', terminated: false, text: 'unterminated' },
	]);
});

test('cat -A keeps numbering and nonprinting on unterminated streams', async () => {
	const fs = new MemoryFS();
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield {
			bytes: new Uint8Array([0x01, 0x0a, 0x02]),
			kind: 'bytes',
		};
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, {
		numberLines: true,
		showAll: true,
	})(input)) {
		records.push(record);
	}

	expect(records).toEqual([
		{ kind: 'line', terminated: undefined, text: '     1\t^A$' },
		{ kind: 'line', terminated: false, text: '     2\t^B' },
	]);
});

// GNU coreutils tests/cat/cat-E.sh:20-25: only physical LF endings receive
// `$`, and a CR immediately before LF is rendered as `^M$`.
test('cat -E preserves an unterminated file ending', async () => {
	const fs = new MemoryFS();
	fs.setFile('/cat-E.txt', 'a\rb\r\nc\n\r\nd\r');
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield { kind: 'file', path: '/cat-E.txt' };
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(
		textDecoder.decode(recordsToBytes(records, { trailingNewline: true }))
	).toBe('a\rb^M$\nc$\n^M$\nd\r');
});

test('cat decodes invalid file bytes only when line transforms require text', async () => {
	const fs = new MemoryFS();
	fs.setFile('/raw.bin', new Uint8Array([0xfe]));
	const input = (async function* (): AsyncIterable<ShellRecord> {
		yield { kind: 'file', path: '/raw.bin' };
	})();

	const records: ShellRecord[] = [];
	for await (const record of cat(fs, { showEnds: true })(input)) {
		records.push(record);
	}

	expect(records).toEqual([
		{
			file: '/raw.bin',
			kind: 'line',
			lineNum: 1,
			terminated: false,
			text: '\ufffd',
		},
	]);
});
