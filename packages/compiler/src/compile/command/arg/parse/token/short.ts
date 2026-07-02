import { Effect } from 'effect';
import { argParseError, unknownFlagError } from '../diagnostics';
import { isShortFlagCharacter } from '../flag-index';
import { setBoolean, setValue } from '../state';
import type { ArgParseError, FlagEntry, TokenParser } from '../types';
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
): ReturnType<TokenParser> =>
	Effect.gen(function* () {
		if (token.length >= 3 && token[2] === '=') {
			return yield* parseShortEqualsToken(
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
			return yield* parseSingleShortToken(
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

		return yield* parseShortClusterToken(
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
	});

function parseShortEqualsToken(
	index: number,
	token: string,
	flagsIndex: Parameters<TokenParser>[3],
	out: Parameters<TokenParser>[4],
	consumedValueIndices: Parameters<TokenParser>[5],
	consumedValueSources: Parameters<TokenParser>[6],
	flagOccurrenceOrder: Parameters<TokenParser>[7],
	orderState: Parameters<TokenParser>[8]
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const name = token.slice(0, 2);
		const value = token.slice(3);
		const entry = yield* getRequiredShortEntry(flagsIndex, name);
		yield* assertTakesValue(entry, name);
		yield* setValue(
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
	});
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
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const entry = yield* getRequiredShortEntry(flagsIndex, token);
		if (!entry.def.takesValue) {
			setBoolean(
				out,
				flagOccurrenceOrder,
				orderState,
				entry.canonical,
				true
			);
			return index;
		}

		const { newIndex, value, valueIndex } = yield* consumeValue(
			args,
			index,
			token,
			flagsIndex,
			entry
		);
		yield* setValue(
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
	});
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
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		for (let j = 1; j < token.length; j++) {
			const ch = token[j] ?? '';
			yield* assertValidShortCharacter(token, ch);

			const name = `-${ch}`;
			const entry = yield* getRequiredShortEntry(flagsIndex, name);
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

			return yield* parseValueFlagInShortCluster(
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
	});
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
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const rest = token.slice(flagPosition + 1);

		if (rest.startsWith('=')) {
			yield* setValue(
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
			const { newIndex, value, valueIndex } = yield* consumeValue(
				args,
				index,
				name,
				flagsIndex,
				entry
			);
			yield* setValue(
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

		yield* assertNotAmbiguousShortValue(
			token,
			name,
			rest,
			flagsIndex,
			entry
		);
		yield* setValue(
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
	});
}

function getRequiredShortEntry(
	flagsIndex: Parameters<TokenParser>[3],
	name: string
): Effect.Effect<FlagEntry, ArgParseError> {
	return Effect.gen(function* () {
		const entry = flagsIndex.short.get(name);
		if (!entry) {
			return yield* unknownFlagError(name);
		}
		return entry;
	});
}

function assertValidShortCharacter(
	token: string,
	ch: string
): Effect.Effect<void, ArgParseError> {
	return Effect.gen(function* () {
		if (isShortFlagCharacter(ch)) {
			return;
		}
		return yield* argParseError(
			'invalid-flag',
			`Invalid short flag character "${ch}" in "${token}". Short flags must be letters.`,
			token
		);
	});
}

function assertTakesValue(
	entry: FlagEntry,
	token: string
): Effect.Effect<void, ArgParseError> {
	return Effect.gen(function* () {
		if (entry.def.takesValue) {
			return;
		}
		return yield* argParseError(
			'invalid-flag',
			`Flag ${token} does not take a value.`,
			token
		);
	});
}

function assertNotAmbiguousShortValue(
	token: string,
	name: string,
	rest: string,
	flagsIndex: Parameters<TokenParser>[3],
	entry: FlagEntry
): Effect.Effect<void, ArgParseError> {
	return Effect.gen(function* () {
		if (entry.def.ambiguousShortValuePolicy === 'value') {
			return;
		}

		const first = rest[0] ?? '';
		if (
			!(isShortFlagCharacter(first) && flagsIndex.short.has(`-${first}`))
		) {
			return;
		}
		return yield* argParseError(
			'ambiguous-short-value',
			`Ambiguous short flag cluster "${token}": ${name} takes a value, but "${rest}" begins with "-${first}" which is also a flag. ` +
				`Use "${name}=${rest}" or pass the value as a separate argument.`,
			token
		);
	});
}
