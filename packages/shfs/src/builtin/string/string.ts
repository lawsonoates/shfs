import type { StringStep } from '@shfs/compiler';
import { Result } from 'better-result';
import picomatch from 'picomatch';
import {
	evaluateExpandedWord,
	evaluateExpandedWords,
} from '../../execute/path';
import type { Record as ShellRecord } from '../../record';
import { textToStdoutRecords } from '../../stdout-record';
import type { Builtin, BuiltinRuntime } from '../types';
import { translateNamedPosixClasses } from './posix-character-class';

const INTEGER_REGEX = /^[+-]?\d+$/;
const CAPTURE_INDEX_REGEX = /^\d+$/;
const PCRE_BACKREF_REGEX = /\\g(\d+)/g;
const REPLACEMENT_TOKEN_REGEX =
	/\\[ELUabefnrtv\\]|\$\$|\$\d+|\$\{[^}]*\}|[\s\S]/g;
const WHITESPACE_CHARS = ' \t\n\r\v\f';
const REPLACEMENT_ESCAPES: Readonly<Record<string, string>> = {
	'\\a': '\x07',
	'\\b': '\b',
	'\\e': '\x1b',
	'\\f': '\f',
	'\\n': '\n',
	'\\r': '\r',
	'\\t': '\t',
	'\\v': '\v',
	'\\\\': '\\',
};
const UTF8_DECODER = new TextDecoder();

const USAGE_ERROR_STATUS = 2;

/**
 * A string subcommand error carrying the exact diagnostic message.
 */
class StringUsageError extends Error {}

interface OptionSpec {
	/** Canonical option name. */
	name: string;
	/** Short flag character, e.g. 'n'. */
	short?: string;
	/** Long flag name, e.g. 'count'. */
	long?: string;
	takesValue: boolean;
}

const SPLIT_OPTIONS: readonly OptionSpec[] = [
	{ name: 'max', short: 'm', long: 'max', takesValue: true },
	{ name: 'right', short: 'r', long: 'right', takesValue: false },
];

interface ParsedOptions {
	options: Map<string, string | true>;
	positional: string[];
}

/**
 * Parse a `--name` or `--name=value` option.
 *
 * @returns the number of operands consumed.
 */
function parseLongOption(
	subcommand: string,
	operands: readonly string[],
	index: number,
	specs: readonly OptionSpec[],
	options: Map<string, string | true>
): number {
	const operand = operands[index] ?? '';
	const equalsIndex = operand.indexOf('=');
	const flagName =
		equalsIndex === -1 ? operand.slice(2) : operand.slice(2, equalsIndex);
	const spec = specs.find((candidate) => candidate.long === flagName);
	if (!spec) {
		throw new StringUsageError(
			`string ${subcommand}: unknown option: --${flagName}`
		);
	}
	if (!spec.takesValue) {
		if (equalsIndex !== -1) {
			throw new StringUsageError(
				`string ${subcommand}: --${flagName}: option does not take an argument`
			);
		}
		options.set(spec.name, true);
		return 1;
	}
	if (equalsIndex !== -1) {
		options.set(spec.name, operand.slice(equalsIndex + 1));
		return 1;
	}
	const value = operands[index + 1];
	if (value === undefined) {
		throw new StringUsageError(
			`string ${subcommand}: --${flagName}: option requires an argument`
		);
	}
	options.set(spec.name, value);
	return 2;
}

/**
 * Parse clustered short flags, possibly with an attached value (-n2).
 *
 * @returns the number of operands consumed.
 */
function parseShortOptions(
	subcommand: string,
	operands: readonly string[],
	index: number,
	specs: readonly OptionSpec[],
	options: Map<string, string | true>
): number {
	const operand = operands[index] ?? '';
	let cursor = 1;
	while (cursor < operand.length) {
		const flagChar = operand[cursor];
		if (flagChar === undefined) {
			break;
		}
		const spec = specs.find((candidate) => candidate.short === flagChar);
		if (!spec) {
			throw new StringUsageError(
				`string ${subcommand}: unknown option: -${flagChar}`
			);
		}
		if (!spec.takesValue) {
			options.set(spec.name, true);
			cursor++;
			continue;
		}
		const attached = operand.slice(cursor + 1);
		if (attached !== '') {
			options.set(spec.name, attached);
			return 1;
		}
		const value = operands[index + 1];
		if (value === undefined) {
			throw new StringUsageError(
				`string ${subcommand}: -${flagChar}: option requires an argument`
			);
		}
		options.set(spec.name, value);
		return 2;
	}
	return 1;
}

/**
 * Parse subcommand options fish-style: flags may appear before or after
 * positional arguments, short flags may attach their value (-n2), and long
 * flags accept --name=value.
 */
function parseOptions(
	subcommand: string,
	operands: readonly string[],
	specs: readonly OptionSpec[]
): ParsedOptions {
	const options = new Map<string, string | true>();
	const positional: string[] = [];
	let flagsDone = false;
	let index = 0;

	while (index < operands.length) {
		const operand = operands[index];
		if (operand === undefined) {
			break;
		}
		if (flagsDone || !operand.startsWith('-') || operand === '-') {
			positional.push(operand);
			index++;
			continue;
		}
		if (operand === '--') {
			flagsDone = true;
			index++;
			continue;
		}
		index += operand.startsWith('--')
			? parseLongOption(subcommand, operands, index, specs, options)
			: parseShortOptions(subcommand, operands, index, specs, options);
	}

	return { options, positional };
}

function parseIntegerOption(
	subcommand: string,
	label: string,
	raw: string,
	validate: (value: number) => boolean
): number {
	if (!INTEGER_REGEX.test(raw)) {
		throw new StringUsageError(
			`string ${subcommand}: Invalid ${label} value '${raw}'`
		);
	}
	const value = Number.parseInt(raw, 10);
	if (!validate(value)) {
		throw new StringUsageError(
			`string ${subcommand}: Invalid ${label} value '${raw}'`
		);
	}
	return value;
}

async function collectStdinLines(runtime: BuiltinRuntime): Promise<string[]> {
	if (!runtime.input) {
		return [];
	}
	const lines: string[] = [];
	for await (const line of runtime.stdin.lines()) {
		lines.push(line);
	}
	return lines;
}

async function resolveInputs(
	runtime: BuiltinRuntime,
	positional: readonly string[]
): Promise<string[]> {
	if (positional.length > 0) {
		return [...positional];
	}
	return await collectStdinLines(runtime);
}

function line(text: string): ShellRecord {
	return { kind: 'line', text };
}

function field(text: string): ShellRecord {
	return { kind: 'line', separation: 'explicit', text };
}

function compile(subcommand: string, pattern: string): RegExp {
	const source = translateNamedPosixClasses(pattern).replace(
		PCRE_BACKREF_REGEX,
		(_whole, group: string) => `\\${group}`
	);
	const result = Result.try({
		try: () => new RegExp(source, 'gu'),
		catch: (error) => error,
	});
	if (Result.isError(result)) {
		throw new StringUsageError(
			`string ${subcommand}: Regular expression compile error: ${String(result.error)}`
		);
	}
	return result.value;
}

function captures(regex: RegExp, value: string, invert: boolean) {
	regex.lastIndex = 0;
	const found = regex.exec(value);
	if (!found) {
		return invert ? [value] : null;
	}
	if (invert) {
		return null;
	}
	return [...found].map((capture) => capture ?? '');
}

function casing(value: string, mode: 'lower' | 'upper' | null): string {
	if (mode === 'lower') {
		return value.toLowerCase();
	}
	if (mode === 'upper') {
		return value.toUpperCase();
	}
	return value;
}

function numericReference(value: string, found: RegExpExecArray): string {
	const index = Number.parseInt(value, 10);
	if (index >= found.length) {
		throw new StringUsageError(
			'string replace: Regular expression substitute error: unknown substring'
		);
	}
	return found[index] ?? '';
}

function reference(token: string, found: RegExpExecArray): string | undefined {
	if (token === '$$') {
		return '$';
	}
	if (token.startsWith('${')) {
		const name = token.slice(2, -1);
		if (CAPTURE_INDEX_REGEX.test(name)) {
			return numericReference(name, found);
		}
		if (!Object.hasOwn(found.groups ?? {}, name)) {
			throw new StringUsageError(
				'string replace: Regular expression substitute error: unknown substring'
			);
		}
		return found.groups?.[name] ?? '';
	}
	if (!token.startsWith('$') || token.length === 1) {
		return undefined;
	}
	return numericReference(token.slice(1), found);
}

function expand(template: string, found: RegExpExecArray): string {
	let mode: 'lower' | 'upper' | null = null;
	let text = '';
	for (const token of template.match(REPLACEMENT_TOKEN_REGEX) ?? []) {
		if (token === '\\L') {
			mode = 'lower';
			continue;
		}
		if (token === '\\U') {
			mode = 'upper';
			continue;
		}
		if (token === '\\E') {
			mode = null;
			continue;
		}
		text += casing(
			reference(token, found) ?? REPLACEMENT_ESCAPES[token] ?? token,
			mode
		);
	}
	return text;
}

function substitute(
	input: string,
	regex: RegExp,
	replacement: string,
	all: boolean
): { changed: boolean; text: string } {
	regex.lastIndex = 0;
	let cursor = 0;
	let text = '';
	let changed = false;
	while (true) {
		const found = regex.exec(input);
		if (!found) {
			break;
		}
		changed = true;
		text += input.slice(cursor, found.index);
		text += expand(replacement, found);
		cursor = found.index + found[0].length;
		if (!all) {
			break;
		}
		if (found[0] === '') {
			const point = input.codePointAt(regex.lastIndex);
			regex.lastIndex += point !== undefined && point > 0xff_ff ? 2 : 1;
		}
	}
	return {
		changed,
		text: changed ? `${text}${input.slice(cursor)}` : input,
	};
}

function selected(
	value: string,
	regex: RegExp | null,
	matcher: ((value: string) => boolean) | null,
	invert: boolean
): string[] | null {
	if (regex) {
		return captures(regex, value, invert);
	}
	if (!matcher || matcher(value) === invert) {
		return null;
	}
	return [value];
}

function plain(
	input: string,
	pattern: string,
	replacement: string,
	all: boolean
): { changed: boolean; text: string } {
	if (pattern === '') {
		return { changed: false, text: input };
	}
	const literalReplacement = () => replacement;
	return {
		changed: input.includes(pattern),
		text: all
			? input.replaceAll(pattern, literalReplacement)
			: input.replace(pattern, literalReplacement),
	};
}

async function configure(runtime: BuiltinRuntime, operands: string[]) {
	const parsed = parseOptions('match', operands, [
		{ name: 'quiet', short: 'q', takesValue: false },
		{ name: 'invert', short: 'v', long: 'invert', takesValue: false },
		{ name: 'regex', short: 'r', long: 'regex', takesValue: false },
	]);
	const [pattern, ...rest] = parsed.positional;
	if (pattern === undefined) {
		throw new StringUsageError('string match: missing argument');
	}
	const values = rest.length > 0 ? rest : await collectStdinLines(runtime);
	if (rest.length === 0 && !runtime.input) {
		throw new StringUsageError('string match requires pattern and value');
	}
	const regex = parsed.options.has('regex')
		? compile('match', pattern)
		: null;
	return {
		invert: parsed.options.has('invert'),
		matcher: regex ? null : picomatch(pattern, { dot: true }),
		quiet: parsed.options.has('quiet'),
		regex,
		values,
	};
}

// ─────────────────────────────────────────────────────────
// Subcommands
// ─────────────────────────────────────────────────────────

function match(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const cfg = await configure(runtime, operands);
		let anyOutput = false;
		for (const value of cfg.values) {
			const output = selected(value, cfg.regex, cfg.matcher, cfg.invert);
			if (!output) {
				continue;
			}
			anyOutput = true;
			if (!cfg.quiet) {
				for (const text of output) {
					yield line(text);
				}
			}
		}
		runtime.context.status = anyOutput ? 0 : 1;
	})();
}

function replace(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions('replace', operands, [
			{ name: 'all', short: 'a', long: 'all', takesValue: false },
			{ name: 'regex', short: 'r', long: 'regex', takesValue: false },
		]);
		const [pattern, replacement, ...rest] = positional;
		if (pattern === undefined || replacement === undefined) {
			throw new StringUsageError(
				'string replace requires pattern replacement text'
			);
		}
		if (rest.length === 0 && !runtime.input) {
			throw new StringUsageError(
				'string replace requires pattern replacement text'
			);
		}
		const inputs =
			rest.length > 0 ? rest : await collectStdinLines(runtime);
		if (inputs.length === 0) {
			runtime.context.status = 1;
			return;
		}

		const all = options.has('all');
		const regex = options.has('regex') ? compile('replace', pattern) : null;
		let replaced = false;
		for (const input of inputs) {
			const result = regex
				? substitute(input, regex, replacement, all)
				: plain(input, pattern, replacement, all);
			replaced ||= result.changed;
			yield* textToStdoutRecords(result.text, true);
		}
		runtime.context.status = replaced ? 0 : 1;
	})();
}

function length(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions('length', operands, [
			{ name: 'quiet', short: 'q', long: 'quiet', takesValue: false },
		]);
		const values = await resolveInputs(runtime, positional);
		let anyNonEmpty = false;
		for (const value of values) {
			const characterCount = [...value].length;
			if (characterCount > 0) {
				anyNonEmpty = true;
			}
			if (!options.has('quiet')) {
				yield line(String(characterCount));
			}
		}
		runtime.context.status = anyNonEmpty ? 0 : 1;
	})();
}

interface SubBounds {
	start: number;
	length: number | null;
	end: number | null;
}

function parseSubBounds(options: Map<string, string | true>): SubBounds {
	if (options.has('end') && options.has('length')) {
		throw new StringUsageError(
			'string sub: invalid option combination, --end and --length are mutually exclusive'
		);
	}
	const start = options.has('start')
		? parseIntegerOption(
				'sub',
				'start',
				String(options.get('start')),
				(value) => value !== 0
			)
		: 1;
	const length = options.has('length')
		? parseIntegerOption(
				'sub',
				'length',
				String(options.get('length')),
				(value) => value >= 0
			)
		: null;
	const end = options.has('end')
		? parseIntegerOption(
				'sub',
				'end',
				String(options.get('end')),
				(value) => value !== 0
			)
		: null;
	return { end, length, start };
}

/**
 * Slice a string by fish `string sub` bounds: 1-based inclusive positions,
 * negative starts count from the end, and negative ends drop that many
 * characters from the end.
 */
function subSlice(value: string, bounds: SubBounds): string {
	const characters = [...value];
	const total = characters.length;
	let from = bounds.start > 0 ? bounds.start : total + 1 + bounds.start;
	if (from < 1) {
		from = 1;
	}
	let to = total;
	if (bounds.end !== null) {
		to = bounds.end > 0 ? bounds.end : total + bounds.end;
	} else if (bounds.length !== null) {
		to = from + bounds.length - 1;
	}
	if (to > total) {
		to = total;
	}
	return to >= from ? characters.slice(from - 1, to).join('') : '';
}

function sub(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions('sub', operands, [
			{ name: 'start', short: 's', long: 'start', takesValue: true },
			{ name: 'length', short: 'l', long: 'length', takesValue: true },
			{ name: 'end', short: 'e', long: 'end', takesValue: true },
		]);
		const bounds = parseSubBounds(options);

		const values = await resolveInputs(runtime, positional);
		for (const value of values) {
			yield line(subSlice(value, bounds));
		}
		runtime.context.status = 0;
	})();
}

function splitValue(
	value: string,
	separator: string,
	max: number | null,
	right: boolean
): string[] {
	if (separator === '') {
		const characters = [...value];
		if (max === null || max >= characters.length) {
			return characters;
		}
		// Splitting an N-char string performs N-1 splits.
		if (right) {
			const keep = characters.length - max;
			return [
				characters.slice(0, keep).join(''),
				...characters.slice(keep),
			];
		}
		return [...characters.slice(0, max), characters.slice(max).join('')];
	}

	const pieces = value.split(separator);
	if (max === null || pieces.length - 1 <= max) {
		return pieces;
	}
	if (right) {
		const keep = pieces.length - max;
		return [pieces.slice(0, keep).join(separator), ...pieces.slice(keep)];
	}
	return [...pieces.slice(0, max), pieces.slice(max).join(separator)];
}

function splitMax(
	subcommand: 'split' | 'split0',
	options: ReadonlyMap<string, string | true>
): number | null {
	return options.has('max')
		? parseIntegerOption(
				subcommand,
				'max',
				String(options.get('max')),
				(value) => value >= 0
			)
		: null;
}

function split(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions(
			'split',
			operands,
			SPLIT_OPTIONS
		);
		const [separator, ...rest] = positional;
		if (separator === undefined) {
			throw new StringUsageError('string split: missing argument');
		}
		const max = splitMax('split', options);

		const values =
			rest.length > 0 ? rest : await collectStdinLines(runtime);
		let anySplit = false;
		for (const value of values) {
			const pieces = splitValue(
				value,
				separator,
				max,
				options.has('right')
			);
			if (pieces.length > 1) {
				anySplit = true;
			}
			for (const piece of pieces) {
				yield field(piece);
			}
		}
		runtime.context.status = anySplit ? 0 : 1;
	})();
}

function split0(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions(
			'split0',
			operands,
			SPLIT_OPTIONS
		);
		const max = splitMax('split0', options);
		let values = positional;
		if (values.length === 0) {
			const bytes = await runtime.stdin.bytes({ trailingNewline: true });
			if (bytes.length === 0) {
				runtime.context.status = 1;
				return;
			}
			values = [UTF8_DECODER.decode(bytes)];
		}

		let anySplit = false;
		for (const value of values) {
			const pieces = splitValue(value, '\0', max, options.has('right'));
			if (pieces.length > 1) {
				anySplit = true;
			}
			if (pieces.at(-1) === '') {
				pieces.pop();
			}
			for (const piece of pieces) {
				yield field(piece);
			}
		}
		runtime.context.status = anySplit ? 0 : 1;
	})();
}

function join(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { positional } = parseOptions('join', operands, []);
		const [separator, ...rest] = positional;
		if (separator === undefined) {
			throw new StringUsageError('string join: missing argument');
		}
		const values =
			rest.length > 0 ? rest : await collectStdinLines(runtime);
		if (values.length > 0) {
			yield line(values.join(separator));
		}
		runtime.context.status = values.length > 1 ? 0 : 1;
	})();
}

function trimCharset(
	value: string,
	chars: string,
	left: boolean,
	right: boolean
): string {
	let start = 0;
	let end = value.length;
	if (left) {
		while (start < end && chars.includes(value[start] ?? '')) {
			start++;
		}
	}
	if (right) {
		while (end > start && chars.includes(value[end - 1] ?? '')) {
			end--;
		}
	}
	return value.slice(start, end);
}

function trim(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions('trim', operands, [
			{ name: 'left', short: 'l', long: 'left', takesValue: false },
			{ name: 'right', short: 'r', long: 'right', takesValue: false },
			{ name: 'chars', short: 'c', long: 'chars', takesValue: true },
		]);
		const chars = options.has('chars')
			? String(options.get('chars'))
			: WHITESPACE_CHARS;
		const explicitSide = options.has('left') || options.has('right');
		const left = !explicitSide || options.has('left');
		const right = !explicitSide || options.has('right');

		const values = await resolveInputs(runtime, positional);
		let anyTrimmed = false;
		for (const value of values) {
			const trimmed = trimCharset(value, chars, left, right);
			if (trimmed !== value) {
				anyTrimmed = true;
			}
			yield line(trimmed);
		}
		runtime.context.status = anyTrimmed ? 0 : 1;
	})();
}

/**
 * Resolve the repeat count from -n/--count, falling back to the first
 * positional argument.
 */
function parseRepeatCount(
	options: Map<string, string | true>,
	strings: string[]
): number {
	let countText: string | null = options.has('count')
		? String(options.get('count'))
		: null;
	if (countText === null) {
		const first = strings.shift();
		if (first === undefined) {
			throw new StringUsageError('string repeat: missing argument');
		}
		countText = first;
	}
	return parseIntegerOption(
		'repeat',
		'count',
		countText,
		(value) => value >= 0
	);
}

function repeat(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { options, positional } = parseOptions('repeat', operands, [
			{ name: 'count', short: 'n', long: 'count', takesValue: true },
			{ name: 'quiet', short: 'q', long: 'quiet', takesValue: false },
		]);

		let strings = [...positional];
		const count = parseRepeatCount(options, strings);

		if (strings.length > 0 && runtime.input) {
			throw new StringUsageError('string repeat: too many arguments');
		}
		if (strings.length === 0) {
			strings = await collectStdinLines(runtime);
		}

		let anyOutput = false;
		for (const value of strings) {
			const repeated = value.repeat(count);
			if (repeated !== '') {
				anyOutput = true;
				if (!options.has('quiet')) {
					yield line(repeated);
				}
			}
		}
		runtime.context.status = anyOutput ? 0 : 1;
	})();
}

function changeCase(mode: 'lower' | 'upper') {
	return (runtime: BuiltinRuntime, operands: string[]) =>
		(async function* () {
			const { options, positional } = parseOptions(mode, operands, [
				{
					long: 'quiet',
					name: 'quiet',
					short: 'q',
					takesValue: false,
				},
			]);
			const values = await resolveInputs(runtime, positional);
			let anyChanged = false;
			for (const value of values) {
				const changed =
					mode === 'lower'
						? value.toLowerCase()
						: value.toUpperCase();
				if (changed !== value) {
					anyChanged = true;
				}
				if (!options.has('quiet')) {
					yield line(changed);
				}
			}
			runtime.context.status = anyChanged ? 0 : 1;
		})();
}

const SUBCOMMANDS: Record<
	string,
	(runtime: BuiltinRuntime, operands: string[]) => AsyncGenerator<ShellRecord>
> = {
	join,
	length,
	lower: changeCase('lower'),
	match,
	repeat,
	replace,
	split,
	split0,
	sub,
	trim,
	upper: changeCase('upper'),
};

export const string: Builtin<StringStep['args']> = (runtime, args) => {
	return (async function* () {
		try {
			if (args.subcommand === null) {
				throw new StringUsageError('string: missing subcommand');
			}
			const subcommand = await evaluateExpandedWord(
				args.subcommand,
				runtime.fs,
				runtime.context
			);
			const operands = await evaluateExpandedWords(
				args.operands,
				runtime.fs,
				runtime.context
			);

			const handler = SUBCOMMANDS[subcommand];
			if (!handler) {
				throw new StringUsageError(
					`string ${subcommand}: invalid subcommand`
				);
			}
			yield* handler(runtime, operands);
		} catch (error) {
			if (error instanceof StringUsageError) {
				runtime.context.stderr.append(error.message);
				runtime.context.status = USAGE_ERROR_STATUS;
				return;
			}
			throw error;
		}
	})();
};
