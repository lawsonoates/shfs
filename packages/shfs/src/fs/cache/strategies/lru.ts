import type { CacheEntrySnapshot, CacheStrategy } from '../types';

export interface LruStrategyOptions {
	maxEntries: number;
}

function validateMaxEntries(maxEntries: number): void {
	if (!Number.isInteger(maxEntries) || maxEntries < 0) {
		throw new Error(
			`lruStrategy: maxEntries must be an integer >= 0, received ${maxEntries}`
		);
	}
}

function sortByLeastRecentlyUsed(
	entries: readonly CacheEntrySnapshot[]
): CacheEntrySnapshot[] {
	return [...entries].sort((left, right) => {
		if (left.lastAccessedAt !== right.lastAccessedAt) {
			return left.lastAccessedAt - right.lastAccessedAt;
		}
		if (left.insertedAt !== right.insertedAt) {
			return left.insertedAt - right.insertedAt;
		}
		return left.key.localeCompare(right.key);
	});
}

export function lruStrategy(options: LruStrategyOptions): CacheStrategy {
	validateMaxEntries(options.maxEntries);

	return {
		name: 'lru',
		evict(entries) {
			if (entries.length <= options.maxEntries) {
				return [];
			}
			const overflow = entries.length - options.maxEntries;
			return sortByLeastRecentlyUsed(entries)
				.slice(0, overflow)
				.map((entry) => entry.key);
		},
	};
}
