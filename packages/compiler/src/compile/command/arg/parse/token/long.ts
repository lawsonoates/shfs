import { Effect } from 'effect';
import { startsWithNoLongPrefix } from '../../utils';
import { argParseError, unknownFlagError } from '../diagnostics';
import { setBoolean, setValue } from '../state';
import type { ArgParseError, TokenParser } from '../types';
import { consumeValue } from './value';

interface LongTokenContext {
	args: Parameters<TokenParser>[0];
	consumedValueIndices: Parameters<TokenParser>[5];
	consumedValueSources: Parameters<TokenParser>[6];
	flagOccurrenceOrder: Parameters<TokenParser>[7];
	flagsIndex: Parameters<TokenParser>[3];
	index: number;
	orderState: Parameters<TokenParser>[8];
	out: Parameters<TokenParser>[4];
	token: string;
}

export const parseLongToken: TokenParser = (
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
		const context: LongTokenContext = {
			args,
			consumedValueIndices,
			consumedValueSources,
			flagOccurrenceOrder,
			flagsIndex,
			index,
			orderState,
			out,
			token,
		};
		if (startsWithNoLongPrefix(token) && !token.includes('=')) {
			return yield* parseNoLongToken(context);
		}

		if (token.includes('=')) {
			return yield* parseLongEqualsToken(context);
		}

		return yield* parsePlainLongToken(context);
	});

function parseNoLongToken(
	context: LongTokenContext
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const base = `--${context.token.slice('--no-'.length)}`;
		const entry = context.flagsIndex.long.get(base);
		if (!entry) {
			return yield* unknownFlagError(context.token);
		}
		if (entry.def.takesValue) {
			return yield* argParseError(
				'invalid-flag',
				`Flag ${base} takes a value; "${context.token}" is invalid.`,
				context.token
			);
		}
		setBoolean(
			context.out,
			context.flagOccurrenceOrder,
			context.orderState,
			entry.canonical,
			false
		);
		return context.index;
	});
}

function parseLongEqualsToken(
	context: LongTokenContext
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const eq = context.token.indexOf('=');
		const name = context.token.slice(0, eq);
		const value = context.token.slice(eq + 1);
		const entry = context.flagsIndex.long.get(name);
		if (!entry) {
			return yield* unknownFlagError(name);
		}

		if (!entry.def.takesValue) {
			return yield* argParseError(
				'invalid-flag',
				`Flag ${name} does not take a value.`,
				name
			);
		}
		yield* setValue(
			context.out,
			context.consumedValueIndices,
			context.consumedValueSources,
			context.flagOccurrenceOrder,
			context.orderState,
			entry,
			value,
			context.index,
			'inline'
		);
		return context.index;
	});
}

function parsePlainLongToken(
	context: LongTokenContext
): Effect.Effect<number, ArgParseError> {
	return Effect.gen(function* () {
		const entry = context.flagsIndex.long.get(context.token);
		if (!entry) {
			return yield* unknownFlagError(context.token);
		}

		if (!entry.def.takesValue) {
			setBoolean(
				context.out,
				context.flagOccurrenceOrder,
				context.orderState,
				entry.canonical,
				true
			);
			return context.index;
		}

		const { newIndex, value, valueIndex } = yield* consumeValue(
			context.args,
			context.index,
			context.token,
			context.flagsIndex,
			entry
		);
		yield* setValue(
			context.out,
			context.consumedValueIndices,
			context.consumedValueSources,
			context.flagOccurrenceOrder,
			context.orderState,
			entry,
			value,
			valueIndex,
			'arg'
		);
		return newIndex;
	});
}
