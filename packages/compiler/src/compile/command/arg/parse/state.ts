import { argParseError } from './diagnostics';
import type {
	ConsumedValueIndices,
	ConsumedValueSources,
	FlagEntry,
	FlagOccurrenceOrder,
	ParsedFlags,
	ParsedValueSource,
	ParseOrderState,
} from './types';

export function appendPositional(
	positional: string[],
	positionalIndices: number[],
	token: string,
	index: number
): void {
	positional.push(token);
	positionalIndices.push(index);
}

export function cloneFlags(source: ParsedFlags): ParsedFlags {
	const cloned: ParsedFlags = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = Array.isArray(value) ? [...value] : value;
	}
	return cloned;
}

export function cloneConsumedValueIndices(
	source: ConsumedValueIndices
): ConsumedValueIndices {
	const cloned: ConsumedValueIndices = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = [...value];
	}
	return cloned;
}

export function cloneConsumedValueSources(
	source: ConsumedValueSources
): ConsumedValueSources {
	const cloned: ConsumedValueSources = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = [...value];
	}
	return cloned;
}

export function cloneFlagOccurrenceOrder(
	source: FlagOccurrenceOrder
): FlagOccurrenceOrder {
	const cloned: FlagOccurrenceOrder = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = [...value];
	}
	return cloned;
}

export function setBoolean(
	out: ParsedFlags,
	flagOccurrenceOrder: FlagOccurrenceOrder,
	orderState: ParseOrderState,
	canonical: string,
	value: boolean
): void {
	// booleans can be repeated; last one wins (e.g. --no-x --x)
	out[canonical] = value;
	recordFlagOccurrence(
		flagOccurrenceOrder,
		canonical,
		orderState.nextFlagOrder
	);
	orderState.nextFlagOrder += 1;
}

export function setValue(
	out: ParsedFlags,
	consumedValueIndices: ConsumedValueIndices,
	consumedValueSources: ConsumedValueSources,
	flagOccurrenceOrder: FlagOccurrenceOrder,
	orderState: ParseOrderState,
	entry: FlagEntry,
	value: string,
	valueIndex: number,
	valueSource: ParsedValueSource
): void {
	const { canonical, def } = entry;
	const recordValueUsage = () => {
		recordConsumedValueIndex(consumedValueIndices, canonical, valueIndex);
		recordConsumedValueSource(consumedValueSources, canonical, valueSource);
		recordFlagOccurrence(
			flagOccurrenceOrder,
			canonical,
			orderState.nextFlagOrder
		);
		orderState.nextFlagOrder += 1;
	};

	const existing = out[canonical];
	if (existing === undefined) {
		out[canonical] = value;
		recordValueUsage();
		return;
	}

	// Repeated value flags must be explicit.
	if (!def.multiple) {
		throw argParseError(
			'duplicate-flag',
			`Duplicate flag "${canonical}". If it is intended to repeat, set { multiple: true } in its definition.`
		);
	}

	if (Array.isArray(existing)) {
		existing.push(value);
		recordValueUsage();
		return;
	}

	// existing is string|boolean; value-flags should only ever store string here
	if (typeof existing === 'string') {
		out[canonical] = [existing, value];
		recordValueUsage();
		return;
	}

	// Should be unreachable unless user mixes boolean/value definitions for the same canonical key
	throw argParseError(
		'invalid-state',
		`Invalid state for flag "${canonical}".`
	);
}

function recordConsumedValueIndex(
	consumedValueIndices: ConsumedValueIndices,
	canonical: string,
	valueIndex: number
): void {
	const existing = consumedValueIndices[canonical];
	if (!existing) {
		consumedValueIndices[canonical] = [valueIndex];
		return;
	}
	existing.push(valueIndex);
}

function recordConsumedValueSource(
	consumedValueSources: ConsumedValueSources,
	canonical: string,
	valueSource: ParsedValueSource
): void {
	const existing = consumedValueSources[canonical];
	if (!existing) {
		consumedValueSources[canonical] = [valueSource];
		return;
	}
	existing.push(valueSource);
}

function recordFlagOccurrence(
	flagOccurrenceOrder: FlagOccurrenceOrder,
	canonical: string,
	order: number
): void {
	const existing = flagOccurrenceOrder[canonical];
	if (!existing) {
		flagOccurrenceOrder[canonical] = [order];
		return;
	}
	existing.push(order);
}
