import type { FlagEntry, FlagIndex } from '../types';

export function consumeValue(
	args: readonly string[],
	index: number,
	flagToken: string,
	flagsIndex: FlagIndex,
	entry: FlagEntry
): { value: string; newIndex: number; valueIndex: number } {
	const nextIndex = index + 1;
	if (nextIndex >= args.length) {
		throw new Error(`Flag ${flagToken} requires a value.`);
	}

	const next = args[nextIndex];
	if (next === undefined) {
		throw new Error(`Flag ${flagToken} requires a value.`);
	}

	if (next === '--') {
		throw new Error(`Flag ${flagToken} requires a value (got "--").`);
	}

	if (!entry.def.allowFlagLikeValue && flagsIndex.isFlagToken(next)) {
		throw new Error(`Flag ${flagToken} requires a value (got "${next}").`);
	}

	return { value: next, newIndex: nextIndex, valueIndex: nextIndex };
}
