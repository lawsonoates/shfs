import { argParseError } from '../diagnostics';
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
		throw argParseError(
			'missing-value',
			`Flag ${flagToken} requires a value.`,
			flagToken
		);
	}

	const next = args[nextIndex];
	if (next === undefined) {
		throw argParseError(
			'missing-value',
			`Flag ${flagToken} requires a value.`,
			flagToken
		);
	}

	if (next === '--') {
		throw argParseError(
			'missing-value',
			`Flag ${flagToken} requires a value (got "--").`,
			flagToken
		);
	}

	if (!entry.def.allowFlagLikeValue && flagsIndex.isFlagToken(next)) {
		throw argParseError(
			'missing-value',
			`Flag ${flagToken} requires a value (got "${next}").`,
			flagToken
		);
	}

	return { value: next, newIndex: nextIndex, valueIndex: nextIndex };
}
