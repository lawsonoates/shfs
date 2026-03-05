import { startsWithNoLongPrefix } from '../../utils';
import { throwUnknownFlag } from '../diagnostics';
import { setBoolean, setValue } from '../state';
import type { TokenParser } from '../types';
import { consumeValue } from './value';

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
): number => {
	if (startsWithNoLongPrefix(token) && !token.includes('=')) {
		const base = `--${token.slice('--no-'.length)}`;
		const entry = flagsIndex.long.get(base);
		if (!entry) {
			throwUnknownFlag(token);
		}
		if (entry.def.takesValue) {
			throw new Error(
				`Flag ${base} takes a value; "${token}" is invalid.`
			);
		}
		setBoolean(
			out,
			flagOccurrenceOrder,
			orderState,
			entry.canonical,
			false
		);
		return index;
	}

	if (token.includes('=')) {
		const eq = token.indexOf('=');
		const name = token.slice(0, eq);
		const value = token.slice(eq + 1);
		const entry = flagsIndex.long.get(name);
		if (!entry) {
			throwUnknownFlag(name);
		}

		if (!entry.def.takesValue) {
			throw new Error(`Flag ${name} does not take a value.`);
		}
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

	const entry = flagsIndex.long.get(token);
	if (!entry) {
		throwUnknownFlag(token);
	}

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
};
