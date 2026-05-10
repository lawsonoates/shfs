import { expect, test } from 'bun:test';

import type { Flag } from '#compiler/compile/command/arg/flag';
import {
	createArgParser,
	type FlagDef,
	parseArgs,
	parseWords,
} from '#compiler/compile/command/arg/parse';
import { literal } from '#compiler/ir';

const mixedFlags: Record<string, Flag> = {
	number: { short: 'n', takesValue: false },
	output: { short: 'o', long: 'output', takesValue: true },
};

const valueFlags: Record<string, Flag> = {
	lines: { short: 'n', takesValue: true },
};

const longOnlyFlags: Record<string, FlagDef> = {
	include: { long: 'include', takesValue: true },
};

const grepStyleFlags: Record<string, FlagDef> = {
	invert: { short: 'v', takesValue: false },
	regexp: {
		short: 'e',
		takesValue: true,
		allowFlagLikeValue: true,
		ambiguousShortValuePolicy: 'value',
	},
};

test('parseArgs returns positional indices for non-flag tokens', () => {
	const parsed = parseArgs(
		['-n', 'file1.txt', '-o', 'out.txt', 'file2.txt'],
		mixedFlags
	);

	expect(parsed.flags.number).toBe(true);
	expect(parsed.flags.output).toBe('out.txt');
	expect(parsed.consumedValueIndices).toEqual({ output: [3] });
	expect(parsed.positional).toEqual(['file1.txt', 'file2.txt']);
	expect(parsed.positionalIndices).toEqual([1, 4]);
});

test('createArgParser reuses compiled index and parses args', () => {
	const parseWithIndex = createArgParser(mixedFlags);
	const parsed = parseWithIndex(['-n', 'file.txt']);

	expect(parsed.flags.number).toBe(true);
	expect(parsed.consumedValueIndices).toEqual({});
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([1]);
});

test('parseArgs treats tokens after "--" as positional', () => {
	const parsed = parseArgs(['--', '-n', '-'], mixedFlags);

	expect(parsed.consumedValueIndices).toEqual({});
	expect(parsed.flags.number).toBeUndefined();
	expect(parsed.positional).toEqual(['-n', '-']);
	expect(parsed.positionalIndices).toEqual([1, 2]);
});

test('parseArgs treats negative-number-like tokens as positional by default', () => {
	const parsed = parseArgs(['-1'], mixedFlags);

	expect(parsed.consumedValueIndices).toEqual({});
	expect(parsed.positional).toEqual(['-1']);
	expect(parsed.positionalIndices).toEqual([0]);
});

test('parseArgs can map negative-number-like tokens into a value flag', () => {
	const parsed = parseArgs(['-10', 'file.txt'], valueFlags, {
		negativeNumberFlag: 'lines',
		negativeNumberPolicy: 'value',
	});

	expect(parsed.consumedValueIndices).toEqual({ lines: [0] });
	expect(parsed.flags.lines).toBe('10');
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([1]);
});

test('parseArgs rejects missing negativeNumberFlag when policy is value', () => {
	expect(() => {
		parseArgs(['-10'], valueFlags, {
			negativeNumberPolicy: 'value',
		});
	}).toThrow(
		'negativeNumberFlag is required when negativeNumberPolicy is "value".'
	);
});

test('parseArgs rejects unknown negativeNumberFlag canonical name', () => {
	expect(() => {
		parseArgs(['-10'], valueFlags, {
			negativeNumberFlag: 'missing',
			negativeNumberPolicy: 'value',
		});
	}).toThrow('Unknown negativeNumberFlag: "missing".');
});

test('parseArgs uses unknownFlagPolicy=positional without partial flag commits', () => {
	const parsed = parseArgs(['-nx'], mixedFlags, {
		unknownFlagPolicy: 'positional',
	});

	expect(parsed.flags.number).toBeUndefined();
	expect(parsed.consumedValueIndices).toEqual({});
	expect(parsed.positional).toEqual(['-nx']);
	expect(parsed.positionalIndices).toEqual([0]);
});

test('parseArgs uses unknownFlagPolicy=ignore', () => {
	const parsed = parseArgs(['--missing', 'file.txt'], mixedFlags, {
		unknownFlagPolicy: 'ignore',
	});

	expect(parsed.consumedValueIndices).toEqual({});
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([1]);
});

test('parseArgs defaults to error on unknown flags', () => {
	expect(() => {
		parseArgs(['--missing'], mixedFlags);
	}).toThrow('Unknown flag: --missing');
});

test('parseArgs supports long-only flags', () => {
	const parsed = parseArgs(['--include', '*.ts', 'src'], longOnlyFlags);

	expect(parsed.flags.include).toBe('*.ts');
	expect(parsed.positional).toEqual(['src']);
	expect(parsed.positionalIndices).toEqual([2]);
});

test('parseArgs allows flag-like value when configured', () => {
	const parsed = parseArgs(['-e', '-v', 'file.txt'], grepStyleFlags);

	expect(parsed.flags.regexp).toBe('-v');
	expect(parsed.flags.invert).toBeUndefined();
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([2]);
});

test('parseArgs allows ambiguous short-cluster value when configured', () => {
	const parsed = parseArgs(['-ev', 'file.txt'], grepStyleFlags);

	expect(parsed.flags.regexp).toBe('v');
	expect(parsed.flags.invert).toBeUndefined();
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([1]);
});

test('parseWords returns positional words and consumed value indices', () => {
	const parsed = parseWords(
		[literal('-n'), literal('file.txt'), literal('-o'), literal('out.txt')],
		mixedFlags
	);

	expect(parsed.flags.number).toBe(true);
	expect(parsed.flags.output).toBe('out.txt');
	expect(parsed.consumedValueIndices).toEqual({ output: [3] });
	expect(parsed.positional).toEqual(['file.txt']);
	expect(parsed.positionalIndices).toEqual([1]);
	expect(parsed.positionalWords).toEqual([literal('file.txt')]);
});
