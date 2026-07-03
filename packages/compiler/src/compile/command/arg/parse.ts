import { Result } from 'better-result';
import type { ExpandedWord } from '../../../ir';
import { expandedWordToString } from '../../../ir';
import { parseArgsWithIndex, parseArgsWithIndexEffect } from './parse/engine';
import { buildFlagIndex } from './parse/flag-index';
import type {
	ArgParseError,
	FlagDef,
	ParseOptions,
	ParseResult,
	ParseWordsResult,
} from './parse/types';

export type {
	ArgParseError,
	ConsumedValueIndices,
	ConsumedValueSources,
	FlagDef,
	FlagIndex,
	FlagOccurrenceOrder,
	NegativeNumberPolicy,
	ParseDiagnostic,
	ParsedFlags,
	ParsedFlagValue,
	ParsedValueSource,
	ParseErrorPolicy,
	ParseOptions,
	ParseResult,
	ParseWordsResult,
	UnknownFlagPolicy,
} from './parse/types';

export function createArgParser(
	flagDefs: Record<string, FlagDef>
): (args: readonly string[], options?: ParseOptions) => ParseResult {
	const index = buildFlagIndex(flagDefs);
	return (args: readonly string[], options?: ParseOptions): ParseResult => {
		return parseArgsWithIndex(args, index, options);
	};
}

export function createArgParserEffect(
	flagDefs: Record<string, FlagDef>
): (
	args: readonly string[],
	options?: ParseOptions
) => Result<ParseResult, ArgParseError> {
	const index = buildFlagIndex(flagDefs);
	return (args: readonly string[], options?: ParseOptions) => {
		return parseArgsWithIndexEffect(args, index, options);
	};
}

export function createWordParser<TWord>(
	flagDefs: Record<string, FlagDef>,
	wordToString: (word: TWord) => string
): (
	words: readonly TWord[],
	options?: ParseOptions
) => ParseWordsResult<TWord> {
	const parseWithIndex = createArgParser(flagDefs);
	return (
		words: readonly TWord[],
		options?: ParseOptions
	): ParseWordsResult<TWord> => {
		const args = words.map(wordToString);
		const parsed = parseWithIndex(args, options);
		const positionalWords = parsed.positionalIndices.flatMap((index) => {
			const word = words[index];
			return word === undefined ? [] : [word];
		});
		return { ...parsed, positionalWords };
	};
}

export function createWordParserEffect<TWord>(
	flagDefs: Record<string, FlagDef>,
	wordToString: (word: TWord) => string
): (
	words: readonly TWord[],
	options?: ParseOptions
) => Result<ParseWordsResult<TWord>, ArgParseError> {
	const parseWithIndex = createArgParserEffect(flagDefs);
	return (words: readonly TWord[], options?: ParseOptions) =>
		Result.gen(function* () {
			const args = words.map(wordToString);
			const parsed = yield* parseWithIndex(args, options);
			const positionalWords = parsed.positionalIndices.flatMap(
				(index) => {
					const word = words[index];
					return word === undefined ? [] : [word];
				}
			);
			return Result.ok({ ...parsed, positionalWords });
		});
}

export function parseArgs(
	args: readonly string[],
	flagDefs: Record<string, FlagDef>,
	options?: ParseOptions
): ParseResult {
	const parser = createArgParser(flagDefs);
	return parser(args, options);
}

export function parseArgsEffect(
	args: readonly string[],
	flagDefs: Record<string, FlagDef>,
	options?: ParseOptions
): Result<ParseResult, ArgParseError> {
	const parser = createArgParserEffect(flagDefs);
	return parser(args, options);
}

export function parseWords(
	words: readonly ExpandedWord[],
	flagDefs: Record<string, FlagDef>,
	options?: ParseOptions
): ParseWordsResult<ExpandedWord> {
	const parser = createWordParser<ExpandedWord>(
		flagDefs,
		expandedWordToString
	);
	return parser(words, options);
}

export function parseWordsEffect(
	words: readonly ExpandedWord[],
	flagDefs: Record<string, FlagDef>,
	options?: ParseOptions
): Result<ParseWordsResult<ExpandedWord>, ArgParseError> {
	const parser = createWordParserEffect<ExpandedWord>(
		flagDefs,
		expandedWordToString
	);
	return parser(words, options);
}
