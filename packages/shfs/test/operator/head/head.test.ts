import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { head, headLines } from '@/operator/head/head';
import {
	type ByteRecord,
	type FileRecord,
	type LineRecord,
	recordsToBytes,
} from '@/record';

const textDecoder = new TextDecoder();

async function collectHeadLines(
	fs: MemoryFS,
	input: AsyncIterable<FileRecord>
): Promise<string[]> {
	const records: ByteRecord[] = [];
	for await (const record of head(fs)(input)) {
		records.push(record);
	}
	const text = textDecoder.decode(
		recordsToBytes(records, { trailingNewline: true })
	);
	const lines = text.split('\n');
	if (lines.at(-1) === '') {
		lines.pop();
	}
	return lines;
}

test('head reads first 10 lines by default', async () => {
	const fs = new MemoryFS();
	const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join(
		'\n'
	);
	fs.setFile('/test.txt', lines);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: '/test.txt' };
	}

	const result = await collectHeadLines(fs, createFileStream());

	expect(result).toHaveLength(10);
	expect(result[0]).toBe('line1');
	expect(result[9]).toBe('line10');
});

test('head reads fewer lines than requested', async () => {
	const fs = new MemoryFS();
	const lines = Array.from({ length: 5 }, (_, i) => `line${i + 1}`).join(
		'\n'
	);
	fs.setFile('/short.txt', lines);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: '/short.txt' };
	}

	const result = await collectHeadLines(fs, createFileStream());

	expect(result).toHaveLength(5);
	expect(result).toEqual(['line1', 'line2', 'line3', 'line4', 'line5']);
});

test('head handles multiple files', async () => {
	const fs = new MemoryFS();
	fs.setFile(
		'/file1.txt',
		Array.from({ length: 15 }, (_, i) => `file1-line${i + 1}`).join('\n')
	);
	fs.setFile(
		'/file2.txt',
		Array.from({ length: 15 }, (_, i) => `file2-line${i + 1}`).join('\n')
	);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: '/file1.txt' };
		yield { kind: 'file', path: '/file2.txt' };
	}

	const result = await collectHeadLines(fs, createFileStream());

	expect(result).toHaveLength(20); // 10 from each file
	expect(result[0]).toBe('file1-line1');
	expect(result[9]).toBe('file1-line10');
	expect(result[10]).toBe('file2-line1');
	expect(result[19]).toBe('file2-line10');
});

test('head with single line file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/single.txt', 'only line');

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: '/single.txt' };
	}

	const result = await collectHeadLines(fs, createFileStream());

	expect(result).toEqual(['only line']);
});

test('head line mode does not pull beyond its limit', async () => {
	let pulls = 0;
	const lines = async function* (): AsyncIterable<LineRecord> {
		pulls++;
		yield { kind: 'line', text: 'first' };
		pulls++;
		yield { kind: 'line', text: 'second' };
	};
	const selected: LineRecord[] = [];
	for await (const line of headLines(1)(lines())) {
		selected.push(line);
	}

	expect(selected).toEqual([{ kind: 'line', text: 'first' }]);
	expect(pulls).toBe(1);

	for await (const line of headLines(0)(lines())) {
		selected.push(line);
	}
	expect(pulls).toBe(1);
});
