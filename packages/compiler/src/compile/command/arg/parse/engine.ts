import { Result } from 'better-result';
import {
	isNegativeNumberToken,
	startsWithLongPrefix,
	startsWithShortPrefix,
} from '../utils';
import {
	createParseDiagnostic,
	isArgParseError,
	isUnknownFlagError,
} from './diagnostics';
import { getNegativeNumberValueEntry, normalizeOptions } from './options';
import {
	appendPositional,
	cloneConsumedValueIndices,
	cloneConsumedValueSources,
	cloneFlagOccurrenceOrder,
	cloneFlags,
	setValue,
} from './state';
import { parseLongToken } from './token/long';
import { parseShortToken } from './token/short';
import type {
	ArgParseError,
	ConsumedValueIndices,
	ConsumedValueSources,
	FlagIndex,
	FlagOccurrenceOrder,
	ParseDiagnostic,
	ParsedFlags,
	ParsedFlagTokenResult,
	ParseOptions,
	ParseOrderState,
	ParseResult,
	ProcessTokenResult,
	TokenParser,
	UnknownFlagPolicy,
} from './types';

export function parseArgsWithIndex(
	args: readonly string[],
	index: FlagIndex,
	options?: ParseOptions
): ParseResult {
	const normalizedOptions = normalizeOptions(options);
	const negativeNumberValueEntry = getNegativeNumberValueEntry(
		normalizedOptions,
		index
	);

	let consumedValueIndices: ConsumedValueIndices = Object.create(null);
	let consumedValueSources: ConsumedValueSources = Object.create(null);
	const diagnostics: ParseDiagnostic[] = [];
	let flagOccurrenceOrder: FlagOccurrenceOrder = Object.create(null);
	let flags: ParsedFlags = Object.create(null);
	const positional: string[] = [];
	const positionalIndices: number[] = [];
	let nextFlagOrder = 0;
	let endOfFlags = false;

	for (let i = 0; i < args.length; i++) {
		const token = args[i];
		if (token === undefined) {
			continue;
		}

		let processed: ProcessTokenResult;
		try {
			processed = processToken({
				args,
				consumedValueIndices,
				consumedValueSources,
				diagnostics,
				endOfFlags,
				flagOccurrenceOrder,
				flags,
				flagsIndex: index,
				index: i,
				negativeNumberValueEntry,
				nextFlagOrder,
				positional,
				positionalIndices,
				safeParseErrors: normalizedOptions.errorPolicy === 'diagnostic',
				token,
				unknownFlagPolicy: normalizedOptions.unknownFlagPolicy,
			});
		} catch (error) {
			if (normalizedOptions.errorPolicy !== 'diagnostic') {
				throw error;
			}
			diagnostics.push(
				createParseDiagnostic('parse-error', token, i, error)
			);
			continue;
		}

		consumedValueIndices = processed.consumedValueIndices;
		consumedValueSources = processed.consumedValueSources;
		endOfFlags = processed.endOfFlags;
		flagOccurrenceOrder = processed.flagOccurrenceOrder;
		flags = processed.flags;
		i = processed.newIndex;
		nextFlagOrder = processed.nextFlagOrder;
	}

	return {
		consumedValueIndices,
		consumedValueSources,
		diagnostics,
		flagOccurrenceOrder,
		flags,
		positional,
		positionalIndices,
	};
}

export function parseArgsWithIndexEffect(
	args: readonly string[],
	index: FlagIndex,
	options?: ParseOptions
): Result<ParseResult, ArgParseError> {
	try {
		return Result.ok(parseArgsWithIndex(args, index, options));
	} catch (error) {
		if (isArgParseError(error)) {
			return Result.err(error);
		}
		throw error;
	}
}

function processToken(params: {
	args: readonly string[];
	consumedValueIndices: ConsumedValueIndices;
	consumedValueSources: ConsumedValueSources;
	diagnostics: ParseDiagnostic[];
	endOfFlags: boolean;
	flagOccurrenceOrder: FlagOccurrenceOrder;
	flags: ParsedFlags;
	flagsIndex: FlagIndex;
	index: number;
	negativeNumberValueEntry?: Parameters<typeof setValue>[5];
	nextFlagOrder: number;
	positional: string[];
	positionalIndices: number[];
	safeParseErrors: boolean;
	token: string;
	unknownFlagPolicy: UnknownFlagPolicy;
}): ProcessTokenResult {
	const {
		args,
		consumedValueIndices,
		consumedValueSources,
		diagnostics,
		endOfFlags,
		flagOccurrenceOrder,
		flags,
		flagsIndex,
		index,
		negativeNumberValueEntry,
		nextFlagOrder,
		positional,
		positionalIndices,
		safeParseErrors,
		token,
		unknownFlagPolicy,
	} = params;

	if (endOfFlags || token === '-') {
		appendPositional(positional, positionalIndices, token, index);
		return {
			consumedValueIndices,
			consumedValueSources,
			endOfFlags,
			flagOccurrenceOrder,
			flags,
			newIndex: index,
			nextFlagOrder,
		};
	}

	if (token === '--') {
		return {
			consumedValueIndices,
			consumedValueSources,
			endOfFlags: true,
			flagOccurrenceOrder,
			flags,
			newIndex: index,
			nextFlagOrder,
		};
	}

	if (isNegativeNumberToken(token)) {
		if (!negativeNumberValueEntry) {
			appendPositional(positional, positionalIndices, token, index);
			return {
				consumedValueIndices,
				consumedValueSources,
				endOfFlags,
				flagOccurrenceOrder,
				flags,
				newIndex: index,
				nextFlagOrder,
			};
		}

		const orderState: ParseOrderState = { nextFlagOrder };
		setValue(
			flags,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState,
			negativeNumberValueEntry,
			token.slice(1),
			index,
			'inline'
		);
		return {
			consumedValueIndices,
			consumedValueSources,
			endOfFlags,
			flagOccurrenceOrder,
			flags,
			newIndex: index,
			nextFlagOrder: orderState.nextFlagOrder,
		};
	}

	const parser = getTokenParser(token);
	if (!parser) {
		appendPositional(positional, positionalIndices, token, index);
		return {
			consumedValueIndices,
			consumedValueSources,
			endOfFlags,
			flagOccurrenceOrder,
			flags,
			newIndex: index,
			nextFlagOrder,
		};
	}

	const parsed = parsePotentialFlagToken(
		args,
		index,
		token,
		flagsIndex,
		flags,
		consumedValueIndices,
		consumedValueSources,
		flagOccurrenceOrder,
		nextFlagOrder,
		safeParseErrors,
		unknownFlagPolicy,
		parser
	);
	if (!parsed) {
		if (unknownFlagPolicy === 'diagnostic') {
			diagnostics.push(
				createParseDiagnostic('unknown-flag', token, index, token)
			);
		}
		handleUnrecognizedToken(
			unknownFlagPolicy,
			positional,
			positionalIndices,
			token,
			index
		);
		return {
			consumedValueIndices,
			consumedValueSources,
			endOfFlags,
			flagOccurrenceOrder,
			flags,
			newIndex: index,
			nextFlagOrder,
		};
	}

	return {
		consumedValueIndices: parsed.consumedValueIndices,
		consumedValueSources: parsed.consumedValueSources,
		endOfFlags,
		flagOccurrenceOrder: parsed.flagOccurrenceOrder,
		flags: parsed.flags,
		newIndex: parsed.newIndex,
		nextFlagOrder: parsed.nextFlagOrder,
	};
}

function getTokenParser(token: string): TokenParser | undefined {
	if (startsWithLongPrefix(token)) {
		return parseLongToken;
	}
	if (startsWithShortPrefix(token)) {
		return parseShortToken;
	}
	return undefined;
}

function parsePotentialFlagToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	currentFlags: ParsedFlags,
	currentConsumedValueIndices: ConsumedValueIndices,
	currentConsumedValueSources: ConsumedValueSources,
	currentFlagOccurrenceOrder: FlagOccurrenceOrder,
	currentNextFlagOrder: number,
	safeParseErrors: boolean,
	unknownFlagPolicy: UnknownFlagPolicy,
	parser: TokenParser
): ParsedFlagTokenResult | null {
	const shouldClone = safeParseErrors || unknownFlagPolicy !== 'error';
	if (!shouldClone) {
		const orderState: ParseOrderState = {
			nextFlagOrder: currentNextFlagOrder,
		};
		const newIndex = parser(
			args,
			index,
			token,
			flagsIndex,
			currentFlags,
			currentConsumedValueIndices,
			currentConsumedValueSources,
			currentFlagOccurrenceOrder,
			orderState
		);
		return {
			consumedValueIndices: currentConsumedValueIndices,
			consumedValueSources: currentConsumedValueSources,
			flagOccurrenceOrder: currentFlagOccurrenceOrder,
			flags: currentFlags,
			newIndex,
			nextFlagOrder: orderState.nextFlagOrder,
		};
	}

	const candidateFlags = cloneFlags(currentFlags);
	const candidateConsumedValueIndices = cloneConsumedValueIndices(
		currentConsumedValueIndices
	);
	const candidateConsumedValueSources = cloneConsumedValueSources(
		currentConsumedValueSources
	);
	const candidateFlagOccurrenceOrder = cloneFlagOccurrenceOrder(
		currentFlagOccurrenceOrder
	);
	const orderState: ParseOrderState = {
		nextFlagOrder: currentNextFlagOrder,
	};
	let newIndex: number;
	try {
		newIndex = parser(
			args,
			index,
			token,
			flagsIndex,
			candidateFlags,
			candidateConsumedValueIndices,
			candidateConsumedValueSources,
			candidateFlagOccurrenceOrder,
			orderState
		);
	} catch (error) {
		if (isUnknownFlagError(error) && unknownFlagPolicy !== 'error') {
			return null;
		}
		throw error;
	}
	return {
		consumedValueIndices: candidateConsumedValueIndices,
		consumedValueSources: candidateConsumedValueSources,
		flagOccurrenceOrder: candidateFlagOccurrenceOrder,
		flags: candidateFlags,
		newIndex,
		nextFlagOrder: orderState.nextFlagOrder,
	};
}

function handleUnrecognizedToken(
	policy: UnknownFlagPolicy,
	positional: string[],
	positionalIndices: number[],
	token: string,
	index: number
): void {
	if (policy === 'positional') {
		appendPositional(positional, positionalIndices, token, index);
	}
}
