import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import type { FileRecord } from '../../record';
import { head } from './head';

test('head reads first 10 lines by default', async () => {
	const fs = new MemoryFS();
	const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join(
		'\n'
	);
	fs.setFile('/test.txt', lines);

	async function* createFileStream(): AsyncIterable<FileRecord> {
		yield { kind: 'file', path: '/test.txt' };
	}

	const result: string[] = [];
	const transducer = head(fs);
	for await (const record of transducer(createFileStream())) {
		if (record.kind === 'line') {
			result.push(record.text);
		}
	}

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

	const result: string[] = [];
	const transducer = head(fs);
	for await (const record of transducer(createFileStream())) {
		if (record.kind === 'line') {
			result.push(record.text);
		}
	}

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

	const result: string[] = [];
	const transducer = head(fs);
	for await (const record of transducer(createFileStream())) {
		if (record.kind === 'line') {
			result.push(record.text);
		}
	}

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

	const result: string[] = [];
	const transducer = head(fs);
	for await (const record of transducer(createFileStream())) {
		if (record.kind === 'line') {
			result.push(record.text);
		}
	}

	expect(result).toEqual(['only line']);
});
