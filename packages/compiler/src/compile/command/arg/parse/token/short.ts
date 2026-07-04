import { argParseError, unknownFlagError } from '../diagnostics';
import { isShortFlagCharacter } from '../flag-index';
import { setBoolean, setValue } from '../state';
import type { FlagEntry, TokenParser } from '../types';
import { consumeValue } from './value';

export const parseShortToken: TokenParser = (
	args,
	index,
	token,
	flagsIndex,
	out,
	consumedValueIndices,
	consumedValueSources,
	flagOccurrenceOrder,
	orderState
): ReturnType<TokenParser> => {
	if (token.length >= 3 && token[2] === '=') {
		return parseShortEqualsToken(
			index,
			token,
			flagsIndex,
			out,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState
		);
	}

	if (token.length === 2) {
		return parseSingleShortToken(
			args,
			index,
			token,
			flagsIndex,
			out,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState
		);
	}

	return parseShortClusterToken(
		args,
		index,
		token,
		flagsIndex,
		out,
		consumedValueIndices,
		consumedValueSources,
		flagOccurrenceOrder,
		orderState
	);
};

function parseShortEqualsToken(
	index: number,
	token: string,
	flagsIndex: Parameters<TokenParser>[3],
	out: Parameters<TokenParser>[4],
	consumedValueIndices: Parameters<TokenParser>[5],
	consumedValueSources: Parameters<TokenParser>[6],
	flagOccurrenceOrder: Parameters<TokenParser>[7],
	orderState: Parameters<TokenParser>[8]
): number {
	const name = token.slice(0, 2);
	const value = token.slice(3);
	const entry = getRequiredShortEntry(flagsIndex, name);
	assertTakesValue(entry, name);
	setValue(
		out,
		consumedValueIndices,
		consumedValueSources,
		flagOccurrenceOrder,
		orderState,
		entry,
		value,
		index,
		'inline'
	);
	return index;
}

function parseSingleShortToken(
	args: Parameters<TokenParser>[0],
	index: number,
	token: string,
	flagsIndex: Parameters<TokenParser>[3],
	out: Parameters<TokenParser>[4],
	consumedValueIndices: Parameters<TokenParser>[5],
	consumedValueSources: Parameters<TokenParser>[6],
	flagOccurrenceOrder: Parameters<TokenParser>[7],
	orderState: Parameters<TokenParser>[8]
): number {
	const entry = getRequiredShortEntry(flagsIndex, token);
	if (!entry.def.takesValue) {
		setBoolean(out, flagOccurrenceOrder, orderState, entry.canonical, true);
		return index;
	}

	const { newIndex, value, valueIndex } = consumeValue(
		args,
		index,
		token,
		flagsIndex,
		entry
	);
	setValue(
		out,
		consumedValueIndices,
		consumedValueSources,
		flagOccurrenceOrder,
		orderState,
		entry,
		value,
		valueIndex,
		'arg'
	);
	return newIndex;
}

function parseShortClusterToken(
	args: Parameters<TokenParser>[0],
	index: number,
	token: string,
	flagsIndex: Parameters<TokenParser>[3],
	out: Parameters<TokenParser>[4],
	consumedValueIndices: Parameters<TokenParser>[5],
	consumedValueSources: Parameters<TokenParser>[6],
	flagOccurrenceOrder: Parameters<TokenParser>[7],
	orderState: Parameters<TokenParser>[8]
): number {
	for (let j = 1; j < token.length; j++) {
		const ch = token[j] ?? '';
		assertValidShortCharacter(token, ch);

		const name = `-${ch}`;
		const entry = getRequiredShortEntry(flagsIndex, name);
		if (!entry.def.takesValue) {
			setBoolean(
				out,
				flagOccurrenceOrder,
				orderState,
				entry.canonical,
				true
			);
			continue;
		}

		return parseValueFlagInShortCluster(
			args,
			index,
			token,
			j,
			name,
			entry,
			flagsIndex,
			out,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState
		);
	}

	return index;
}

function parseValueFlagInShortCluster(
	args: Parameters<TokenParser>[0],
	index: number,
	token: string,
	flagPosition: number,
	name: string,
	entry: FlagEntry,
	flagsIndex: Parameters<TokenParser>[3],
	out: Parameters<TokenParser>[4],
	consumedValueIndices: Parameters<TokenParser>[5],
	consumedValueSources: Parameters<TokenParser>[6],
	flagOccurrenceOrder: Parameters<TokenParser>[7],
	orderState: Parameters<TokenParser>[8]
): number {
	const rest = token.slice(flagPosition + 1);

	if (rest.startsWith('=')) {
		setValue(
			out,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState,
			entry,
			rest.slice(1),
			index,
			'inline'
		);
		return index;
	}

	if (rest.length === 0) {
		const { newIndex, value, valueIndex } = consumeValue(
			args,
			index,
			name,
			flagsIndex,
			entry
		);
		setValue(
			out,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			orderState,
			entry,
			value,
			valueIndex,
			'arg'
		);
		return newIndex;
	}

	assertNotAmbiguousShortValue(token, name, rest, flagsIndex, entry);
	setValue(
		out,
		consumedValueIndices,
		consumedValueSources,
		flagOccurrenceOrder,
		orderState,
		entry,
		rest,
		index,
		'inline'
	);
	return index;
}

function getRequiredShortEntry(
	flagsIndex: Parameters<TokenParser>[3],
	name: string
): FlagEntry {
	const entry = flagsIndex.short.get(name);
	if (!entry) {
		throw unknownFlagError(name);
	}
	return entry;
}

function assertValidShortCharacter(token: string, ch: string): void {
	if (isShortFlagCharacter(ch)) {
		return;
	}
	throw argParseError(
		'invalid-flag',
		`Invalid short flag character "${ch}" in "${token}". Short flags must be letters.`,
		token
	);
}

function assertTakesValue(entry: FlagEntry, token: string): void {
	if (entry.def.takesValue) {
		return;
	}
	throw argParseError(
		'invalid-flag',
		`Flag ${token} does not take a value.`,
		token
	);
}

function assertNotAmbiguousShortValue(
	token: string,
	name: string,
	rest: string,
	flagsIndex: Parameters<TokenParser>[3],
	entry: FlagEntry
): void {
	if (entry.def.ambiguousShortValuePolicy === 'value') {
		return;
	}

	const first = rest[0] ?? '';
	if (!(isShortFlagCharacter(first) && flagsIndex.short.has(`-${first}`))) {
		return;
	}
	throw argParseError(
		'ambiguous-short-value',
		`Ambiguous short flag cluster "${token}": ${name} takes a value, but "${rest}" begins with "-${first}" which is also a flag. ` +
			`Use "${name}=${rest}" or pass the value as a separate argument.`,
		token
	);
}
