import type { FS } from '../fs';

export type CacheEntryKind = 'exists' | 'file' | 'stat';

export type CacheStatValue = Awaited<ReturnType<FS['stat']>>;

export interface CacheEntrySnapshot {
	accessCount: number;
	insertedAt: number;
	kind: CacheEntryKind;
	key: string;
	lastAccessedAt: number;
	path: string;
	sizeHint: number;
}

export interface CacheStrategyContext {
	entryCount: number;
	now: number;
}

export interface CacheGetDecision {
	hit?: boolean;
	stale?: boolean;
}

export interface CacheSetDecision {
	cache?: boolean;
}

export interface CacheStrategy {
	readonly name?: string;
	evict?(
		entries: readonly CacheEntrySnapshot[],
		context: CacheStrategyContext
	): Iterable<string> | undefined;
	onGet?(
		entry: CacheEntrySnapshot,
		context: CacheStrategyContext
	): CacheGetDecision | undefined;
	onSet?(
		entry: CacheEntrySnapshot,
		context: CacheStrategyContext
	): CacheSetDecision | undefined;
}

export interface CachedFSOptions {
	normalizePath?: (path: string) => string;
	now?: () => number;
	strategies?: readonly CacheStrategy[];
}
