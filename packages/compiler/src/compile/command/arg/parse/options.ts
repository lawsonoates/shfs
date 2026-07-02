import { Effect } from 'effect';
import { argParseError } from './diagnostics';
import type {
	ArgParseError,
	FlagEntry,
	FlagIndex,
	NormalizedParseOptions,
	ParseOptions,
} from './types';

export function normalizeOptions(
	options?: ParseOptions
): NormalizedParseOptions {
	return {
		errorPolicy: options?.errorPolicy ?? 'throw',
		negativeNumberPolicy: options?.negativeNumberPolicy ?? 'positional',
		negativeNumberFlag: options?.negativeNumberFlag,
		unknownFlagPolicy: options?.unknownFlagPolicy ?? 'error',
	};
}

export function getNegativeNumberValueEntry(
	options: NormalizedParseOptions,
	index: FlagIndex
): FlagEntry | undefined {
	return Effect.runSync(getNegativeNumberValueEntryEffect(options, index));
}

export function getNegativeNumberValueEntryEffect(
	options: NormalizedParseOptions,
	index: FlagIndex
): Effect.Effect<FlagEntry | undefined, ArgParseError> {
	return Effect.gen(function* () {
		if (options.negativeNumberPolicy === 'positional') {
			return undefined;
		}

		if (!options.negativeNumberFlag) {
			return yield* argParseError(
				'invalid-option',
				'negativeNumberFlag is required when negativeNumberPolicy is "value".'
			);
		}

		const entry = index.canonical.get(options.negativeNumberFlag);
		if (!entry) {
			return yield* argParseError(
				'invalid-option',
				`Unknown negativeNumberFlag: "${options.negativeNumberFlag}".`
			);
		}

		if (!entry.def.takesValue) {
			return yield* argParseError(
				'invalid-option',
				`negativeNumberFlag "${options.negativeNumberFlag}" must reference a flag that takes a value.`
			);
		}

		return entry;
	});
}
