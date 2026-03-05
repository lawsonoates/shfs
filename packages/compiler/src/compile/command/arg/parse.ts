import type { ExpandedWord } from '../../../ir';
import { expandedWordToString } from '../../../ir';
import { parseArgsWithIndex } from './parse/engine';
import { buildFlagIndex } from './parse/flag-index';
import type {
	FlagDef,
	ParseOptions,
	ParseResult,
	ParseWordsResult,
} from './parse/types';

export type {
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

export function parseArgs(
	args: readonly string[],
	flagDefs: Record<string, FlagDef>,
	options?: ParseOptions
): ParseResult {
	const parser = createArgParser(flagDefs);
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
