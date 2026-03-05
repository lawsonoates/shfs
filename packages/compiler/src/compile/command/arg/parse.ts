import type { ExpandedWord } from '../../../ir';
import { expandedWordToString } from '../../../ir';
import type { Flag } from './flag';
import {
	isNegativeNumberToken,
	splitNameBeforeEquals,
	startsWithLongPrefix,
	startsWithNoLongPrefix,
	startsWithShortPrefix,
} from './utils';

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

export type UnknownFlagPolicy = 'error' | 'positional' | 'ignore';

export type NegativeNumberPolicy = 'positional' | 'value';

export interface ParseOptions {
	unknownFlagPolicy?: UnknownFlagPolicy;
	negativeNumberPolicy?: NegativeNumberPolicy;
	negativeNumberFlag?: string;
}

export interface ParseResult {
	consumedValueIndices: Record<string, number[]>;
	flags: Record<string, ParsedFlagValue>;
	positional: string[];
	positionalIndices: number[];
}

export interface ParseWordsResult<TWord> extends ParseResult {
	positionalWords: TWord[];
}

interface NormalizedParseOptions {
	unknownFlagPolicy: UnknownFlagPolicy;
	negativeNumberPolicy: NegativeNumberPolicy;
	negativeNumberFlag?: string;
}

interface FlagEntry {
	canonical: string;
	def: FlagDef;
}

interface FlagIndex {
	canonical: Map<string, FlagEntry>;
	short: Map<string, FlagEntry>; // key: "-n"
	long: Map<string, FlagEntry>; // key: "--name"
	isFlagToken: (token: string) => boolean;
}

interface ParsedFlagTokenResult {
	consumedValueIndices: Record<string, number[]>;
	flags: Record<string, ParsedFlagValue>;
	newIndex: number;
}

interface ProcessTokenResult {
	consumedValueIndices: Record<string, number[]>;
	endOfFlags: boolean;
	flags: Record<string, ParsedFlagValue>;
	newIndex: number;
}

const SHORT_NAME_REGEX = /^[A-Za-z]$/;
const LONG_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const UNKNOWN_FLAG_PREFIX = 'Unknown flag: ';

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

function parseArgsWithIndex(
	args: readonly string[],
	index: FlagIndex,
	options?: ParseOptions
): ParseResult {
	const normalizedOptions = normalizeOptions(options);
	const negativeNumberValueEntry = getNegativeNumberValueEntry(
		normalizedOptions,
		index
	);

	let consumedValueIndices: Record<string, number[]> = Object.create(null);
	let flags: Record<string, ParsedFlagValue> = Object.create(null);
	const positional: string[] = [];
	const positionalIndices: number[] = [];

	let endOfFlags = false;

	for (let i = 0; i < args.length; i++) {
		const token = args[i];
		if (token === undefined) {
			continue;
		}

		const result = processToken({
			args,
			consumedValueIndices,
			endOfFlags,
			flags,
			flagsIndex: index,
			index: i,
			negativeNumberValueEntry,
			positional,
			positionalIndices,
			token,
			unknownFlagPolicy: normalizedOptions.unknownFlagPolicy,
		});
		consumedValueIndices = result.consumedValueIndices;
		endOfFlags = result.endOfFlags;
		flags = result.flags;
		i = result.newIndex;
	}

	return { consumedValueIndices, flags, positional, positionalIndices };
}

function processToken(params: {
	args: readonly string[];
	consumedValueIndices: Record<string, number[]>;
	endOfFlags: boolean;
	flags: Record<string, ParsedFlagValue>;
	flagsIndex: FlagIndex;
	index: number;
	negativeNumberValueEntry?: FlagEntry;
	positional: string[];
	positionalIndices: number[];
	token: string;
	unknownFlagPolicy: UnknownFlagPolicy;
}): ProcessTokenResult {
	const {
		args,
		consumedValueIndices,
		endOfFlags,
		flags,
		flagsIndex,
		index,
		negativeNumberValueEntry,
		positional,
		positionalIndices,
		token,
		unknownFlagPolicy,
	} = params;

	if (endOfFlags || token === '-') {
		appendPositional(positional, positionalIndices, token, index);
		return { consumedValueIndices, endOfFlags, flags, newIndex: index };
	}

	// End-of-flags marker
	if (token === '--') {
		return {
			consumedValueIndices,
			endOfFlags: true,
			flags,
			newIndex: index,
		};
	}

	if (isNegativeNumberToken(token)) {
		if (!negativeNumberValueEntry) {
			appendPositional(positional, positionalIndices, token, index);
			return { consumedValueIndices, endOfFlags, flags, newIndex: index };
		}
		setValue(
			flags,
			consumedValueIndices,
			negativeNumberValueEntry,
			token.slice(1),
			index
		);
		return { consumedValueIndices, endOfFlags, flags, newIndex: index };
	}

	const parser = getTokenParser(token);
	if (!parser) {
		appendPositional(positional, positionalIndices, token, index);
		return { consumedValueIndices, endOfFlags, flags, newIndex: index };
	}

	const parsed = parsePotentialFlagToken(
		args,
		index,
		token,
		flagsIndex,
		flags,
		consumedValueIndices,
		unknownFlagPolicy,
		parser
	);
	if (!parsed) {
		handleUnrecognizedToken(
			unknownFlagPolicy,
			positional,
			positionalIndices,
			token,
			index
		);
		return { consumedValueIndices, endOfFlags, flags, newIndex: index };
	}

	return {
		consumedValueIndices: parsed.consumedValueIndices,
		endOfFlags,
		flags: parsed.flags,
		newIndex: parsed.newIndex,
	};
}

function getTokenParser(
	token: string
):
	| ((
			args: readonly string[],
			index: number,
			token: string,
			flagsIndex: FlagIndex,
			out: Record<string, ParsedFlagValue>,
			consumedValueIndices: Record<string, number[]>
	  ) => number)
	| undefined {
	if (startsWithLongPrefix(token)) {
		return parseLongToken;
	}
	if (startsWithShortPrefix(token)) {
		return parseShortToken;
	}
	return undefined;
}

function normalizeOptions(options?: ParseOptions): NormalizedParseOptions {
	return {
		negativeNumberPolicy: options?.negativeNumberPolicy ?? 'positional',
		negativeNumberFlag: options?.negativeNumberFlag,
		unknownFlagPolicy: options?.unknownFlagPolicy ?? 'error',
	};
}

function getNegativeNumberValueEntry(
	options: NormalizedParseOptions,
	index: FlagIndex
): FlagEntry | undefined {
	if (options.negativeNumberPolicy === 'positional') {
		return undefined;
	}

	if (!options.negativeNumberFlag) {
		throw new Error(
			'negativeNumberFlag is required when negativeNumberPolicy is "value".'
		);
	}

	const entry = index.canonical.get(options.negativeNumberFlag);
	if (!entry) {
		throw new Error(
			`Unknown negativeNumberFlag: "${options.negativeNumberFlag}".`
		);
	}

	if (!entry.def.takesValue) {
		throw new Error(
			`negativeNumberFlag "${options.negativeNumberFlag}" must reference a flag that takes a value.`
		);
	}

	return entry;
}

function appendPositional(
	positional: string[],
	positionalIndices: number[],
	token: string,
	index: number
): void {
	positional.push(token);
	positionalIndices.push(index);
}

function parsePotentialFlagToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	currentFlags: Record<string, ParsedFlagValue>,
	currentConsumedValueIndices: Record<string, number[]>,
	unknownFlagPolicy: UnknownFlagPolicy,
	parser: (
		args: readonly string[],
		index: number,
		token: string,
		flagsIndex: FlagIndex,
		out: Record<string, ParsedFlagValue>,
		consumedValueIndices: Record<string, number[]>
	) => number
): ParsedFlagTokenResult | null {
	if (unknownFlagPolicy === 'error') {
		const newIndex = parser(
			args,
			index,
			token,
			flagsIndex,
			currentFlags,
			currentConsumedValueIndices
		);
		return {
			consumedValueIndices: currentConsumedValueIndices,
			flags: currentFlags,
			newIndex,
		};
	}

	const candidateFlags = cloneFlags(currentFlags);
	const candidateConsumedValueIndices = cloneConsumedValueIndices(
		currentConsumedValueIndices
	);
	try {
		const newIndex = parser(
			args,
			index,
			token,
			flagsIndex,
			candidateFlags,
			candidateConsumedValueIndices
		);
		return {
			consumedValueIndices: candidateConsumedValueIndices,
			flags: candidateFlags,
			newIndex,
		};
	} catch (error) {
		if (isUnknownFlagError(error)) {
			return null;
		}
		throw error;
	}
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

function cloneFlags(
	source: Record<string, ParsedFlagValue>
): Record<string, ParsedFlagValue> {
	const cloned: Record<string, ParsedFlagValue> = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = Array.isArray(value) ? [...value] : value;
	}
	return cloned;
}

function cloneConsumedValueIndices(
	source: Record<string, number[]>
): Record<string, number[]> {
	const cloned: Record<string, number[]> = Object.create(null);
	for (const [key, value] of Object.entries(source)) {
		cloned[key] = [...value];
	}
	return cloned;
}

function buildFlagIndex(flagDefs: Record<string, FlagDef>): FlagIndex {
	const canonical = new Map<string, FlagEntry>();
	const short = new Map<string, FlagEntry>();
	const long = new Map<string, FlagEntry>();

	const add = (
		map: Map<string, FlagEntry>,
		token: string,
		entry: FlagEntry
	) => {
		const prev = map.get(token);
		if (!prev) {
			map.set(token, entry);
			return;
		}
		throw new Error(
			`Duplicate flag token "${token}" for "${entry.canonical}" and "${prev.canonical}"`
		);
	};

	for (const [canonicalName, def] of Object.entries(flagDefs)) {
		if (!(def.short || def.long)) {
			throw new Error(
				`Flag "${canonicalName}" must define at least one of "short" or "long".`
			);
		}

		const entry = { canonical: canonicalName, def };
		canonical.set(canonicalName, entry);

		// Validate short (optional)
		if (def.short !== undefined) {
			if (!SHORT_NAME_REGEX.test(def.short)) {
				throw new Error(
					`Invalid short flag for "${canonicalName}": "${def.short}". Expected a single letter [A-Za-z].`
				);
			}
			add(short, `-${def.short}`, entry);
		}

		// Validate long (optional)
		if (def.long) {
			if (!LONG_NAME_REGEX.test(def.long)) {
				throw new Error(
					`Invalid long flag for "${canonicalName}": "${def.long}". Expected [A-Za-z0-9][A-Za-z0-9-]*.`
				);
			}
			add(long, `--${def.long}`, entry);
		}
	}

	const isFlagToken = (token: string): boolean => {
		if (token === '--') {
			return true;
		}
		if (token === '-') {
			return false;
		}

		if (startsWithLongPrefix(token)) {
			const name = splitNameBeforeEquals(token);
			if (long.has(name)) {
				return true;
			}

			// --no-<long>
			if (startsWithNoLongPrefix(name)) {
				const base = `--${name.slice('--no-'.length)}`;
				const entry = long.get(base);
				return !!entry && !entry.def.takesValue;
			}
			return false;
		}

		if (startsWithShortPrefix(token)) {
			// "-n", "-abc", "-n10", "-n=10" → look at first short letter
			const ch = token[1] ?? '';
			if (!SHORT_NAME_REGEX.test(ch)) {
				return false;
			}
			return short.has(`-${ch}`);
		}

		return false;
	};

	return { canonical, short, long, isFlagToken };
}

function parseLongToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	// --no-<flag>
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
		setBoolean(out, entry.canonical, false);
		return index;
	}

	// --flag=value (value may contain '='; split at first only)
	if (token.includes('=')) {
		const eq = token.indexOf('=');
		const name = token.slice(0, eq);
		const value = token.slice(eq + 1); // may be empty string
		const entry = flagsIndex.long.get(name);
		if (!entry) {
			throwUnknownFlag(name);
		}

		if (!entry.def.takesValue) {
			throw new Error(`Flag ${name} does not take a value.`);
		}
		setValue(out, consumedValueIndices, entry, value, index);
		return index;
	}

	// --flag [value?]
	const entry = flagsIndex.long.get(token);
	if (!entry) {
		throwUnknownFlag(token);
	}

	if (!entry.def.takesValue) {
		setBoolean(out, entry.canonical, true);
		return index;
	}

	const { newIndex, value, valueIndex } = consumeValue(
		args,
		index,
		token,
		flagsIndex,
		entry
	);
	setValue(out, consumedValueIndices, entry, value, valueIndex);
	return newIndex;
}

function parseShortToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	if (token.length >= 3 && token[2] === '=') {
		return parseShortEqualsToken(
			index,
			token,
			flagsIndex,
			out,
			consumedValueIndices
		);
	}

	if (token.length === 2) {
		return parseSingleShortToken(
			args,
			index,
			token,
			flagsIndex,
			out,
			consumedValueIndices
		);
	}

	return parseShortClusterToken(
		args,
		index,
		token,
		flagsIndex,
		out,
		consumedValueIndices
	);
}

function parseShortEqualsToken(
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	const name = token.slice(0, 2);
	const value = token.slice(3); // may be empty string
	const entry = getRequiredShortEntry(flagsIndex, name);
	assertTakesValue(entry, name);
	setValue(out, consumedValueIndices, entry, value, index);
	return index;
}

function parseSingleShortToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	const entry = getRequiredShortEntry(flagsIndex, token);
	if (!entry.def.takesValue) {
		setBoolean(out, entry.canonical, true);
		return index;
	}

	const { newIndex, value, valueIndex } = consumeValue(
		args,
		index,
		token,
		flagsIndex,
		entry
	);
	setValue(out, consumedValueIndices, entry, value, valueIndex);
	return newIndex;
}

function parseShortClusterToken(
	args: readonly string[],
	index: number,
	token: string,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	// Combined: -la  /  -rn10  /  -rn=10
	// Rule: if a short flag takes a value, it may be followed by:
	//   - "=..." inline (recommended), or
	//   - an inline suffix that does NOT begin with another known short-flag letter, or
	//   - a separate argv token.
	for (let j = 1; j < token.length; j++) {
		const ch = token[j] ?? '';
		assertValidShortCharacter(token, ch);

		const name = `-${ch}`;
		const entry = getRequiredShortEntry(flagsIndex, name);
		if (!entry.def.takesValue) {
			setBoolean(out, entry.canonical, true);
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
			consumedValueIndices
		);
	}

	return index;
}

function parseValueFlagInShortCluster(
	args: readonly string[],
	index: number,
	token: string,
	flagPosition: number,
	name: string,
	entry: FlagEntry,
	flagsIndex: FlagIndex,
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>
): number {
	// This flag takes a value: consume rest of token or next arg.
	const rest = token.slice(flagPosition + 1);

	// Inline value using "=..."
	if (rest.startsWith('=')) {
		setValue(out, consumedValueIndices, entry, rest.slice(1), index); // may be empty
		return index;
	}

	// No inline value: take next arg
	if (rest.length === 0) {
		const { newIndex, value, valueIndex } = consumeValue(
			args,
			index,
			name,
			flagsIndex,
			entry
		);
		setValue(out, consumedValueIndices, entry, value, valueIndex);
		return newIndex;
	}

	assertNotAmbiguousShortValue(token, name, rest, flagsIndex, entry);

	// Safe inline suffix value (e.g. -n10, -n./path, -n-5)
	setValue(out, consumedValueIndices, entry, rest, index);
	return index;
}

function getRequiredShortEntry(flagsIndex: FlagIndex, name: string): FlagEntry {
	const entry = flagsIndex.short.get(name);
	if (!entry) {
		throwUnknownFlag(name);
	}
	return entry;
}

function assertValidShortCharacter(token: string, ch: string): void {
	if (SHORT_NAME_REGEX.test(ch)) {
		return;
	}
	throw new Error(
		`Invalid short flag character "${ch}" in "${token}". Short flags must be letters.`
	);
}

function assertTakesValue(entry: FlagEntry, token: string): void {
	if (entry.def.takesValue) {
		return;
	}
	throw new Error(`Flag ${token} does not take a value.`);
}

function assertNotAmbiguousShortValue(
	token: string,
	name: string,
	rest: string,
	flagsIndex: FlagIndex,
	entry: FlagEntry
): void {
	if (entry.def.ambiguousShortValuePolicy === 'value') {
		return;
	}

	// Ambiguity guard: if remainder begins with a known short flag, force explicit separation.
	const first = rest[0] ?? '';
	if (!(SHORT_NAME_REGEX.test(first) && flagsIndex.short.has(`-${first}`))) {
		return;
	}
	throw new Error(
		`Ambiguous short flag cluster "${token}": ${name} takes a value, but "${rest}" begins with "-${first}" which is also a flag. ` +
			`Use "${name}=${rest}" or pass the value as a separate argument.`
	);
}

function consumeValue(
	args: readonly string[],
	index: number,
	flagToken: string,
	flagsIndex: FlagIndex,
	entry: FlagEntry
): { value: string; newIndex: number; valueIndex: number } {
	const nextIndex = index + 1;
	if (nextIndex >= args.length) {
		throw new Error(`Flag ${flagToken} requires a value.`);
	}

	const next = args[nextIndex];
	if (next === undefined) {
		throw new Error(`Flag ${flagToken} requires a value.`);
	}

	if (next === '--') {
		throw new Error(`Flag ${flagToken} requires a value (got "--").`);
	}

	// Prevent accidentally consuming another flag as a value.
	// If the user truly needs a value that looks like a flag, they can use: --flag=<value> or -f=<value>.
	if (!entry.def.allowFlagLikeValue && flagsIndex.isFlagToken(next)) {
		throw new Error(`Flag ${flagToken} requires a value (got "${next}").`);
	}

	return { value: next, newIndex: nextIndex, valueIndex: nextIndex };
}

function setBoolean(
	out: Record<string, ParsedFlagValue>,
	canonical: string,
	value: boolean
): void {
	// booleans can be repeated; last one wins (e.g. --no-x --x)
	out[canonical] = value;
}

function setValue(
	out: Record<string, ParsedFlagValue>,
	consumedValueIndices: Record<string, number[]>,
	entry: FlagEntry,
	value: string,
	valueIndex: number
): void {
	const { canonical, def } = entry;

	const existing = out[canonical];
	if (existing === undefined) {
		out[canonical] = value;
		recordConsumedValueIndex(consumedValueIndices, canonical, valueIndex);
		return;
	}

	// Repeated value flags must be explicit.
	if (!def.multiple) {
		throw new Error(
			`Duplicate flag "${canonical}". If it is intended to repeat, set { multiple: true } in its definition.`
		);
	}

	if (Array.isArray(existing)) {
		existing.push(value);
		recordConsumedValueIndex(consumedValueIndices, canonical, valueIndex);
		return;
	}

	// existing is string|boolean; value-flags should only ever store string here
	if (typeof existing === 'string') {
		out[canonical] = [existing, value];
		recordConsumedValueIndex(consumedValueIndices, canonical, valueIndex);
		return;
	}

	// Should be unreachable unless user mixes boolean/value definitions for the same canonical key
	throw new Error(`Invalid state for flag "${canonical}".`);
}

function recordConsumedValueIndex(
	consumedValueIndices: Record<string, number[]>,
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

function throwUnknownFlag(token: string): never {
	throw new Error(`${UNKNOWN_FLAG_PREFIX}${token}`);
}

function isUnknownFlagError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.startsWith(UNKNOWN_FLAG_PREFIX);
}
