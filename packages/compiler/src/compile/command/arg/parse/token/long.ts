import { startsWithNoLongPrefix } from '../../utils';
import { argParseError, unknownFlagError } from '../diagnostics';
import { setBoolean, setValue } from '../state';
import type { TokenParser } from '../types';
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
): ReturnType<TokenParser> => {
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
		return parseNoLongToken(context);
	}

	if (token.includes('=')) {
		return parseLongEqualsToken(context);
	}

	return parsePlainLongToken(context);
};

function parseNoLongToken(context: LongTokenContext): number {
	const base = `--${context.token.slice('--no-'.length)}`;
	const entry = context.flagsIndex.long.get(base);
	if (!entry) {
		throw unknownFlagError(context.token);
	}
	if (entry.def.takesValue) {
		throw argParseError(
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
}

function parseLongEqualsToken(context: LongTokenContext): number {
	const eq = context.token.indexOf('=');
	const name = context.token.slice(0, eq);
	const value = context.token.slice(eq + 1);
	const entry = context.flagsIndex.long.get(name);
	if (!entry) {
		throw unknownFlagError(name);
	}

	if (!entry.def.takesValue) {
		throw argParseError(
			'invalid-flag',
			`Flag ${name} does not take a value.`,
			name
		);
	}
	setValue(
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
}

function parsePlainLongToken(context: LongTokenContext): number {
	const entry = context.flagsIndex.long.get(context.token);
	if (!entry) {
		throw unknownFlagError(context.token);
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

	const { newIndex, value, valueIndex } = consumeValue(
		context.args,
		context.index,
		context.token,
		context.flagsIndex,
		entry
	);
	setValue(
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
}
