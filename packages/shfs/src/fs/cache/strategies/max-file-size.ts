import type { CacheStrategy } from '../types';

export interface MaxFileSizeStrategyOptions {
	maxBytes: number;
}

function validateMaxBytes(maxBytes: number): void {
	if (!Number.isInteger(maxBytes) || maxBytes < 0) {
		throw new Error(
			`maxFileSizeStrategy: maxBytes must be an integer >= 0, received ${maxBytes}`
		);
	}
}

export function maxFileSizeStrategy(
	options: MaxFileSizeStrategyOptions
): CacheStrategy {
	validateMaxBytes(options.maxBytes);

	return {
		name: 'max-file-size',
		onSet(entry) {
			if (entry.kind === 'file' && entry.sizeHint > options.maxBytes) {
				return { cache: false };
			}
			return { cache: true };
		},
	};
}
