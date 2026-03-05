import type {
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
	if (options.negativeNumberPolicy === 'positional') {
		return undefined;
	}

	if (!options.negativeNumberFlag) {
		throw new Error(
			'negativeNumberFlag is required when negativeNumberPolicy is "value".'
		);
	}

	const entry = index.canonical.get(options.negativeNumberFlag);
	if (!entry) {
		throw new Error(
			`Unknown negativeNumberFlag: "${options.negativeNumberFlag}".`
		);
	}

	if (!entry.def.takesValue) {
		throw new Error(
			`negativeNumberFlag "${options.negativeNumberFlag}" must reference a flag that takes a value.`
		);
	}

	return entry;
}
