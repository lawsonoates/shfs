import { Effect } from 'effect';
import {
	isNegativeNumberToken,
	startsWithLongPrefix,
	startsWithShortPrefix,
} from '../utils';
import { createParseDiagnostic, isUnknownFlagError } from './diagnostics';
import { getNegativeNumberValueEntryEffect, normalizeOptions } from './options';
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

type ProcessedToken =
	| { kind: 'failure'; error: ArgParseError }
	| { kind: 'success'; result: ProcessTokenResult };

type ParsedFlagToken =
	| { kind: 'failure'; error: ArgParseError }
	| { kind: 'success'; newIndex: number };

export function parseArgsWithIndex(
	args: readonly string[],
	index: FlagIndex,
	options?: ParseOptions
): ParseResult {
	return Effect.runSync(parseArgsWithIndexEffect(args, index, options));
}

export function parseArgsWithIndexEffect(
	args: readonly string[],
	index: FlagIndex,
	options?: ParseOptions
): Effect.Effect<ParseResult, ArgParseError> {
	return Effect.gen(function* () {
		const normalizedOptions = normalizeOptions(options);
		const negativeNumberValueEntry =
			yield* getNegativeNumberValueEntryEffect(normalizedOptions, index);

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

			const processed: ProcessedToken = yield* processToken({
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
			}).pipe(
				Effect.match({
					onFailure: (error) => ({ kind: 'failure', error }) as const,
					onSuccess: (result) =>
						({ kind: 'success', result }) as const,
				})
			);
			if (processed.kind === 'failure') {
				if (normalizedOptions.errorPolicy !== 'diagnostic') {
					return yield* processed.error;
				}
				diagnostics.push(
					createParseDiagnostic(
						'parse-error',
						token,
						i,
						processed.error
					)
				);
				continue;
			}
			const result: ProcessTokenResult = processed.result;
			consumedValueIndices = result.consumedValueIndices;
			consumedValueSources = result.consumedValueSources;
			endOfFlags = result.endOfFlags;
			flagOccurrenceOrder = result.flagOccurrenceOrder;
			flags = result.flags;
			i = result.newIndex;
			nextFlagOrder = result.nextFlagOrder;
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
	});
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
}): Effect.Effect<ProcessTokenResult, ArgParseError> {
	return Effect.gen(function* () {
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
			yield* setValue(
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

		const parsed = yield* parsePotentialFlagToken(
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
	});
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
): Effect.Effect<ParsedFlagTokenResult | null, ArgParseError> {
	return Effect.gen(function* () {
		const shouldClone = safeParseErrors || unknownFlagPolicy !== 'error';
		if (!shouldClone) {
			const orderState: ParseOrderState = {
				nextFlagOrder: currentNextFlagOrder,
			};
			const newIndex = yield* parser(
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
		const parsed: ParsedFlagToken = yield* parser(
			args,
			index,
			token,
			flagsIndex,
			candidateFlags,
			candidateConsumedValueIndices,
			candidateConsumedValueSources,
			candidateFlagOccurrenceOrder,
			orderState
		).pipe(
			Effect.match({
				onFailure: (error) => ({ kind: 'failure', error }) as const,
				onSuccess: (newIndex) =>
					({ kind: 'success', newIndex }) as const,
			})
		);
		if (parsed.kind === 'failure') {
			if (
				isUnknownFlagError(parsed.error) &&
				unknownFlagPolicy !== 'error'
			) {
				return null;
			}
			return yield* parsed.error;
		}
		const newIndex = parsed.newIndex;
		return {
			consumedValueIndices: candidateConsumedValueIndices,
			consumedValueSources: candidateConsumedValueSources,
			flagOccurrenceOrder: candidateFlagOccurrenceOrder,
			flags: candidateFlags,
			newIndex,
			nextFlagOrder: orderState.nextFlagOrder,
		};
	});
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
