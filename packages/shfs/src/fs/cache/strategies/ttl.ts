import type {
	CacheEntrySnapshot,
	CacheGetDecision,
	CacheStrategy,
	CacheStrategyContext,
} from '../types';

export interface TtlStrategyOptions {
	ttlMs: number;
}

function validateTtl(ttlMs: number): void {
	if (!Number.isFinite(ttlMs) || ttlMs < 0) {
		throw new Error(`ttlStrategy: ttlMs must be >= 0, received ${ttlMs}`);
	}
}

function evaluateTtl(
	entry: CacheEntrySnapshot,
	context: CacheStrategyContext,
	ttlMs: number
): CacheGetDecision {
	const ageMs = context.now - entry.insertedAt;
	if (ageMs >= ttlMs) {
		return { stale: true };
	}
	return { hit: true };
}

export function ttlStrategy(options: TtlStrategyOptions): CacheStrategy {
	validateTtl(options.ttlMs);

	return {
		name: 'ttl',
		onGet(entry, context) {
			return evaluateTtl(entry, context, options.ttlMs);
		},
	};
}
