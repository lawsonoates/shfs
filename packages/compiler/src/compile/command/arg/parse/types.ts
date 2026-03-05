import type { Flag } from '../flag';

export type FlagDef = Flag & {
	/**
	 * If true, repeated occurrences collect into an array:
	 *   -I a -I b  =>  { I: ["a","b"] }
	 */
	multiple?: boolean;
	/**
	 * If true, a value-taking flag may consume a token that looks like another
	 * flag (for example: `-e -n` where `-n` is the pattern).
	 */
	allowFlagLikeValue?: boolean;
	/**
	 * Controls short-cluster parsing when the inline suffix could also be
	 * interpreted as flags. Default is `error`.
	 */
	ambiguousShortValuePolicy?: 'error' | 'value';
};

export type ParsedFlagValue = boolean | string | string[];

export type ParsedFlags = Record<string, ParsedFlagValue>;

export type ConsumedValueIndices = Record<string, number[]>;

export type ParsedValueSource = 'arg' | 'inline';

export type ConsumedValueSources = Record<string, ParsedValueSource[]>;

export type FlagOccurrenceOrder = Record<string, number[]>;

export type UnknownFlagPolicy =
	| 'error'
	| 'positional'
	| 'ignore'
	| 'diagnostic';

export type NegativeNumberPolicy = 'positional' | 'value';

export type ParseErrorPolicy = 'throw' | 'diagnostic';

export interface ParseDiagnostic {
	code: 'parse-error' | 'unknown-flag';
	message: string;
	token: string;
	tokenIndex: number;
}

export interface ParseOptions {
	errorPolicy?: ParseErrorPolicy;
	unknownFlagPolicy?: UnknownFlagPolicy;
	negativeNumberPolicy?: NegativeNumberPolicy;
	negativeNumberFlag?: string;
}

export interface ParseResult {
	consumedValueIndices: ConsumedValueIndices;
	consumedValueSources: ConsumedValueSources;
	diagnostics: ParseDiagnostic[];
	flagOccurrenceOrder: FlagOccurrenceOrder;
	flags: ParsedFlags;
	positional: string[];
	positionalIndices: number[];
}

export interface ParseWordsResult<TWord> extends ParseResult {
	positionalWords: TWord[];
}

export interface NormalizedParseOptions {
	errorPolicy: ParseErrorPolicy;
	unknownFlagPolicy: UnknownFlagPolicy;
	negativeNumberPolicy: NegativeNumberPolicy;
	negativeNumberFlag?: string;
}

export interface FlagEntry {
	canonical: string;
	def: FlagDef;
}

export interface FlagIndex {
	canonical: Map<string, FlagEntry>;
	short: Map<string, FlagEntry>;
	long: Map<string, FlagEntry>;
	isFlagToken: (token: string) => boolean;
}

export interface ParseOrderState {
	nextFlagOrder: number;
}

export interface ParsedFlagTokenResult {
	consumedValueIndices: ConsumedValueIndices;
	consumedValueSources: ConsumedValueSources;
	flagOccurrenceOrder: FlagOccurrenceOrder;
	flags: ParsedFlags;
	nextFlagOrder: number;
	newIndex: number;
}

export interface ProcessTokenResult {
	consumedValueIndices: ConsumedValueIndices;
	consumedValueSources: ConsumedValueSources;
	endOfFlags: boolean;
	flagOccurrenceOrder: FlagOccurrenceOrder;
	flags: ParsedFlags;
	nextFlagOrder: number;
	newIndex: number;
}

export type TokenParser = (
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: ParsedFlags,
	consumedValueIndices: ConsumedValueIndices,
	consumedValueSources: ConsumedValueSources,
	flagOccurrenceOrder: FlagOccurrenceOrder,
	orderState: ParseOrderState
) => number;
