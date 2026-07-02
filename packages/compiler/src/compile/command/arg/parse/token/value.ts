import { Effect } from 'effect';
import { argParseError } from '../diagnostics';
import type { ArgParseError, FlagEntry, FlagIndex } from '../types';

export function consumeValue(
	args: readonly string[],
	index: number,
	flagToken: string,
	flagsIndex: FlagIndex,
	entry: FlagEntry
): Effect.Effect<
	{ value: string; newIndex: number; valueIndex: number },
	ArgParseError
> {
	return Effect.gen(function* () {
		const nextIndex = index + 1;
		if (nextIndex >= args.length) {
			return yield* argParseError(
				'missing-value',
				`Flag ${flagToken} requires a value.`,
				flagToken
			);
		}

		const next = args[nextIndex];
		if (next === undefined) {
			return yield* argParseError(
				'missing-value',
				`Flag ${flagToken} requires a value.`,
				flagToken
			);
		}

		if (next === '--') {
			return yield* argParseError(
				'missing-value',
				`Flag ${flagToken} requires a value (got "--").`,
				flagToken
			);
		}

		if (!entry.def.allowFlagLikeValue && flagsIndex.isFlagToken(next)) {
			return yield* argParseError(
				'missing-value',
				`Flag ${flagToken} requires a value (got "${next}").`,
				flagToken
			);
		}

		return { value: next, newIndex: nextIndex, valueIndex: nextIndex };
	});
}
