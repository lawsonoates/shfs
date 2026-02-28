import type { Stream } from '../../stream';
import { normalizePath as defaultNormalizePath } from '../../util/path';
import type { FS } from '../fs';
import type {
	CachedFSOptions,
	CacheEntrySnapshot,
	CacheGetDecision,
	CacheSetDecision,
	CacheStrategy,
	CacheStrategyContext,
} from './types';

const FILE_CACHE_KIND = 'file' as const;
const FILE_KEY_PREFIX = `${FILE_CACHE_KIND}:`;
const ROOT_PATH = '/';
const PATH_SEPARATOR = '/';
const textDecoder = new TextDecoder();

interface FileCacheEntry extends CacheEntrySnapshot {
	kind: typeof FILE_CACHE_KIND;
	value: Uint8Array;
}

function cloneBytes(value: Uint8Array): Uint8Array {
	return new Uint8Array(value);
}

function cacheKeyForPath(path: string): string {
	return `${FILE_KEY_PREFIX}${path}`;
}

function isPathWithin(path: string, directoryPath: string): boolean {
	if (directoryPath === ROOT_PATH) {
		return true;
	}
	if (path === directoryPath) {
		return true;
	}
	return path.startsWith(`${directoryPath}${PATH_SEPARATOR}`);
}

function toSnapshot(entry: FileCacheEntry): CacheEntrySnapshot {
	return {
		accessCount: entry.accessCount,
		insertedAt: entry.insertedAt,
		kind: entry.kind,
		key: entry.key,
		lastAccessedAt: entry.lastAccessedAt,
		path: entry.path,
		sizeHint: entry.sizeHint,
	};
}

function splitLines(content: Uint8Array): string[] {
	const text = textDecoder.decode(content);
	return text
		.split('\n')
		.filter(
			(_, index, lines) =>
				!(index === lines.length - 1 && lines[index] === '')
		);
}

export class CachedFS implements FS {
	private readonly base: FS;
	private readonly cache = new Map<string, FileCacheEntry>();
	private readonly normalizePath: (path: string) => string;
	private readonly now: () => number;
	private readonly strategies: readonly CacheStrategy[];

	constructor(base: FS, options: CachedFSOptions = {}) {
		this.base = base;
		this.normalizePath = options.normalizePath ?? defaultNormalizePath;
		this.now = options.now ?? Date.now;
		this.strategies = options.strategies ?? [];
	}

	async readFile(path: string): Promise<Uint8Array> {
		const normalizedPath = this.normalizePath(path);
		const cached = this.getCachedFile(normalizedPath);
		if (cached !== undefined) {
			return cached;
		}

		const content = await this.base.readFile(path);
		this.setCachedFile(normalizedPath, content);
		return cloneBytes(content);
	}

	async *readLines(path: string): Stream<string> {
		const content = await this.readFile(path);
		yield* splitLines(content);
	}

	async writeFile(path: string, content: Uint8Array): Promise<void> {
		await this.base.writeFile(path, content);
		const normalizedPath = this.normalizePath(path);
		this.invalidatePath(normalizedPath);
		this.setCachedFile(normalizedPath, content);
	}

	async deleteFile(path: string): Promise<void> {
		await this.base.deleteFile(path);
		this.invalidatePath(this.normalizePath(path));
	}

	async deleteDirectory(path: string, recursive = false): Promise<void> {
		await this.base.deleteDirectory(path, recursive);
		this.invalidatePathTree(this.normalizePath(path));
	}

	readdir(path: string): Stream<string> {
		return this.base.readdir(path);
	}

	async mkdir(path: string, recursive = false): Promise<void> {
		await this.base.mkdir(path, recursive);
		this.invalidatePath(this.normalizePath(path));
	}

	stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		return this.base.stat(path);
	}

	exists(path: string): Promise<boolean> {
		return this.base.exists(path);
	}

	private getCachedFile(path: string): Uint8Array | undefined {
		const key = cacheKeyForPath(path);
		const entry = this.cache.get(key);
		if (entry === undefined) {
			return undefined;
		}

		const now = this.now();
		const context = this.strategyContext(now);
		const snapshot = toSnapshot(entry);
		const decision = this.evaluateGet(snapshot, context);
		if (decision.stale) {
			this.cache.delete(key);
			return undefined;
		}
		if (decision.hit === false) {
			return undefined;
		}

		entry.accessCount += 1;
		entry.lastAccessedAt = now;
		return cloneBytes(entry.value);
	}

	private setCachedFile(path: string, content: Uint8Array): void {
		const now = this.now();
		const key = cacheKeyForPath(path);
		const entry: FileCacheEntry = {
			accessCount: 0,
			insertedAt: now,
			kind: FILE_CACHE_KIND,
			key,
			lastAccessedAt: now,
			path,
			sizeHint: content.byteLength,
			value: cloneBytes(content),
		};
		const context = this.strategyContext(now);
		const decision = this.evaluateSet(toSnapshot(entry), context);
		if (decision.cache === false) {
			return;
		}

		this.cache.set(key, entry);
		this.runEvictions(now);
	}

	private invalidatePath(path: string): void {
		this.cache.delete(cacheKeyForPath(path));
	}

	private invalidatePathTree(path: string): void {
		if (path === ROOT_PATH) {
			this.cache.clear();
			return;
		}

		for (const [key, entry] of this.cache.entries()) {
			if (isPathWithin(entry.path, path)) {
				this.cache.delete(key);
			}
		}
	}

	private runEvictions(now: number): void {
		if (this.cache.size === 0) {
			return;
		}

		const snapshots = Array.from(this.cache.values(), (entry) =>
			toSnapshot(entry)
		);
		const context = this.strategyContext(now);
		const evictionKeys = new Set<string>();

		for (const strategy of this.strategies) {
			if (!strategy.evict) {
				continue;
			}
			const keys = strategy.evict(snapshots, context);
			if (!keys) {
				continue;
			}
			for (const key of keys) {
				evictionKeys.add(key);
			}
		}

		for (const key of evictionKeys) {
			this.cache.delete(key);
		}
	}

	private evaluateGet(
		entry: CacheEntrySnapshot,
		context: CacheStrategyContext
	): CacheGetDecision {
		let stale = false;
		let hit = true;

		for (const strategy of this.strategies) {
			if (!strategy.onGet) {
				continue;
			}
			const result = strategy.onGet(entry, context);
			if (!result) {
				continue;
			}
			if (result.stale) {
				stale = true;
			}
			if (result.hit === false) {
				hit = false;
			}
		}

		return { hit, stale };
	}

	private evaluateSet(
		entry: CacheEntrySnapshot,
		context: CacheStrategyContext
	): CacheSetDecision {
		let cache = true;

		for (const strategy of this.strategies) {
			if (!strategy.onSet) {
				continue;
			}
			const result = strategy.onSet(entry, context);
			if (result?.cache === false) {
				cache = false;
			}
		}

		return { cache };
	}

	private strategyContext(now: number): CacheStrategyContext {
		return {
			entryCount: this.cache.size,
			now,
		};
	}
}
