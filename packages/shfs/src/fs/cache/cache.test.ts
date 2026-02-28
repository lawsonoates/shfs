import { expect, test } from 'bun:test';

import type { Stream } from '../../stream';
import { normalizePath } from '../../util/path';
import { MemoryFS } from '../memory';
import { CachedFS } from './cache';
import { lruStrategy } from './strategies/lru';
import { maxFileSizeStrategy } from './strategies/max-file-size';
import { ttlStrategy } from './strategies/ttl';
import type { CacheStrategy } from './types';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

class CountingMemoryFS extends MemoryFS {
	private readonly readFileCounts = new Map<string, number>();

	getReadFileCount(path: string): number {
		return this.readFileCounts.get(normalizePath(path)) ?? 0;
	}

	override async readFile(path: string): Promise<Uint8Array> {
		const normalizedPath = normalizePath(path);
		this.readFileCounts.set(
			normalizedPath,
			(this.readFileCounts.get(normalizedPath) ?? 0) + 1
		);
		return await super.readFile(path);
	}
}

async function collectLines(stream: Stream<string>): Promise<string[]> {
	const lines: string[] = [];
	for await (const line of stream) {
		lines.push(line);
	}
	return lines;
}

test('cached fs supports ttl strategy arrays', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/data.txt', 'hello');

	let nowMs = 0;
	const fs = new CachedFS(base, {
		now: () => nowMs,
		strategies: [ttlStrategy({ ttlMs: 5 })],
	});

	expect(textDecoder.decode(await fs.readFile('/data.txt'))).toBe('hello');
	expect(textDecoder.decode(await fs.readFile('/data.txt'))).toBe('hello');
	expect(base.getReadFileCount('/data.txt')).toBe(1);

	nowMs = 5;
	expect(textDecoder.decode(await fs.readFile('/data.txt'))).toBe('hello');
	expect(base.getReadFileCount('/data.txt')).toBe(2);
});

test('cached fs supports lru strategy arrays', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/a.txt', 'a');
	base.setFile('/b.txt', 'b');

	let nowMs = 0;
	const fs = new CachedFS(base, {
		now: () => nowMs,
		strategies: [lruStrategy({ maxEntries: 1 })],
	});

	await fs.readFile('/a.txt');
	nowMs = 1;
	await fs.readFile('/b.txt');
	nowMs = 2;
	await fs.readFile('/a.txt');

	expect(base.getReadFileCount('/a.txt')).toBe(2);
	expect(base.getReadFileCount('/b.txt')).toBe(1);
});

test('cached fs accepts custom strategy logic', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/small.txt', 'ok');
	base.setFile('/large.txt', '123456');

	const smallFilesOnly: CacheStrategy = {
		name: 'small-files-only',
		onSet(entry) {
			if (entry.kind === 'file' && entry.sizeHint > 4) {
				return { cache: false };
			}
			return { cache: true };
		},
	};

	const fs = new CachedFS(base, {
		strategies: [smallFilesOnly],
	});

	await fs.readFile('/small.txt');
	await fs.readFile('/small.txt');
	await fs.readFile('/large.txt');
	await fs.readFile('/large.txt');

	expect(base.getReadFileCount('/small.txt')).toBe(1);
	expect(base.getReadFileCount('/large.txt')).toBe(2);
});

test('cached fs supports max file size strategy', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/small.txt', 'ok');
	base.setFile('/large.txt', '123456');

	const fs = new CachedFS(base, {
		strategies: [maxFileSizeStrategy({ maxBytes: 4 })],
	});

	await fs.readFile('/small.txt');
	await fs.readFile('/small.txt');
	await fs.readFile('/large.txt');
	await fs.readFile('/large.txt');

	expect(base.getReadFileCount('/small.txt')).toBe(1);
	expect(base.getReadFileCount('/large.txt')).toBe(2);
});

test('cached fs readLines uses cached file bytes', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/lines.txt', 'line1\nline2\n');

	const fs = new CachedFS(base);
	const first = await collectLines(fs.readLines('/lines.txt'));
	const second = await collectLines(fs.readLines('/lines.txt'));

	expect(first).toEqual(['line1', 'line2']);
	expect(second).toEqual(['line1', 'line2']);
	expect(base.getReadFileCount('/lines.txt')).toBe(1);
});

test('cached fs writeFile refreshes cached file content', async () => {
	const base = new CountingMemoryFS();
	base.setFile('/file.txt', 'before');

	const fs = new CachedFS(base);
	expect(textDecoder.decode(await fs.readFile('/file.txt'))).toBe('before');

	await fs.writeFile('/file.txt', textEncoder.encode('after'));
	expect(textDecoder.decode(await fs.readFile('/file.txt'))).toBe('after');
	expect(base.getReadFileCount('/file.txt')).toBe(1);
});

test('cached fs deleteDirectory invalidates nested cached files', async () => {
	const base = new CountingMemoryFS();
	await base.mkdir('/logs', true);
	base.setFile('/logs/a.txt', 'a');

	const fs = new CachedFS(base);
	await fs.readFile('/logs/a.txt');
	await fs.deleteDirectory('/logs', true);

	await expect(fs.readFile('/logs/a.txt')).rejects.toThrow('File not found');
	expect(base.getReadFileCount('/logs/a.txt')).toBe(2);
});
