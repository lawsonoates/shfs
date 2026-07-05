// Translated/adapted from GNU coreutils tests/sort/sort.pl.
// Copyright (C) 2008-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';
import { setTextFile } from './utils';

const INPUT_PATH = '/sort-stdin';

let fs!: MemoryFS;
let $!: Shell['$'];

beforeEach(() => {
	fs = new MemoryFS();
	$ = new Shell(fs).$;
});

interface SortPipeCase {
	behavior: string;
	expected: string;
	input: string;
	name: string;
	options: string;
}

const SORT_PL_CASES = [
	{
		behavior: '-n sorts fractional values before zero correctly',
		expected: '0\n.01',
		input: '.01\n0\n',
		name: 'n1',
		options: '-n',
	},
	{
		behavior: '-n orders fractional values by numeric magnitude',
		expected: '.01\n.02',
		input: '.02\n.01\n',
		name: 'n2',
		options: '-n',
	},
	{
		behavior: '-n treats .00 as smaller than .02',
		expected: '.00\n.02',
		input: '.02\n.00\n',
		name: 'n3',
		options: '-n',
	},
	{
		behavior: '-n preserves numeric equality with different precision',
		expected: '.000\n.02',
		input: '.02\n.000\n',
		name: 'n4',
		options: '-n',
	},
	{
		behavior: '-n keeps already sorted fractional values',
		expected: '.021\n.029',
		input: '.021\n.029\n',
		name: 'n5',
		options: '-n',
	},
	{
		behavior: '-n orders nonnumeric suffixes before numeric values',
		expected: '.0*\n.02',
		input: '.02\n.0*\n',
		name: 'n6',
		options: '-n',
	},
	{
		behavior: '-n orders bare punctuation before numeric values',
		expected: '.*\n.02',
		input: '.02\n.*\n',
		name: 'n7',
		options: '-n',
	},
	{
		behavior: 'default byte ordering preserves already sorted lines',
		expected: 'A\nB\nC',
		input: 'A\nB\nC\n',
		name: '01a',
		options: '',
	},
	{
		behavior: '-k1 sorts using the full first field',
		expected: 'A\nB',
		input: 'B\nA\n',
		name: '03a',
		options: '-k1',
	},
	{
		behavior: '-k1,1 sorts by the first field only',
		expected: 'A\nB',
		input: 'B\nA\n',
		name: '03b',
		options: '-k1,1',
	},
	{
		behavior: 'later keys break ties from earlier equal keys',
		expected: 'A a\nA b',
		input: 'A b\nA a\n',
		name: '03c',
		options: '-k1 -k2',
	},
	{
		behavior: 'character end offset zero is accepted on empty input',
		expected: '',
		input: '',
		name: '03g',
		options: '-k1.1,1.0',
	},
	{
		behavior: 'single-field key with empty input succeeds',
		expected: '',
		input: '',
		name: '03h',
		options: '-k1.1,1',
	},
	{
		behavior: 'bounded first-field key with empty input succeeds',
		expected: '',
		input: '',
		name: '03i',
		options: '-k1,1',
	},
	{
		behavior: '-n compares decimal numbers numerically',
		expected: '2\n11',
		input: '11\n2\n',
		name: '04b',
		options: '-n',
	},
	{
		behavior:
			'-k1 keeps lexicographic ordering distinct from numeric ordering',
		expected: '11\n2',
		input: '11\n2\n',
		name: '04d',
		options: '-k1',
	},
	{
		behavior: '-k2 sorts on the second field',
		expected: 'z-ig A\nignored B',
		input: 'ignored B\nz-ig A\n',
		name: '04e',
		options: '-k2',
	},
	{
		behavior: '-k1,2 sorts by a bounded field range',
		expected: 'A A\nA B',
		input: 'A B\nA A\n',
		name: '05a',
		options: '-k1,2',
	},
	{
		behavior: '-k1,2 sorts by the first two fields before fallback',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '05b',
		options: '-k1,2',
	},
	{
		behavior: 'multiple -k options compare keys in order',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '05c',
		options: '-k1 -k2',
	},
	{
		behavior: '-k2,2 uses only the second field as the explicit key',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '05d',
		options: '-k2,2',
	},
	{
		behavior: '-k2,2 sorts distinct second fields before fallback',
		expected: 'A A A\nA B Z',
		input: 'A B Z\nA A A\n',
		name: '05e',
		options: '-k2,2',
	},
	{
		behavior:
			'-k2,2 preserves GNU fallback ordering for tied second fields',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '05f',
		options: '-k2,2',
	},
	{
		behavior: 'space-separated -k 1,2 form matches compact -k1,2',
		expected: 'A A\nA B',
		input: 'A B\nA A\n',
		name: '06a',
		options: '-k 1,2',
	},
	{
		behavior: 'space-separated -k 1,2 sorts by the first two fields',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '06b',
		options: '-k 1,2',
	},
	{
		behavior: 'space-separated multiple -k options compare in order',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '06c',
		options: '-k 1 -k 2',
	},
	{
		behavior: 'space-separated -k 2,2 uses only the second field',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '06d',
		options: '-k 2,2',
	},
	{
		behavior: 'space-separated -k 2,2 sorts distinct second fields',
		expected: 'A A A\nA B Z',
		input: 'A B Z\nA A A\n',
		name: '06e',
		options: '-k 2,2',
	},
	{
		behavior: 'space-separated -k 2,2 preserves fallback ordering',
		expected: 'A A Z\nA B A',
		input: 'A B A\nA A Z\n',
		name: '06f',
		options: '-k 2,2',
	},
	{
		behavior: '-k 2,3 sorts by a multi-field key range',
		expected: '7 a a\n9 a b',
		input: '9 a b\n7 a a\n',
		name: '07a',
		options: '-k 2,3',
	},
	{
		behavior:
			'-k 2,3 falls back to whole-line order for equal key prefixes',
		expected: 'z a a\na a b',
		input: 'a a b\nz a a\n',
		name: '07b',
		options: '-k 2,3',
	},
	{
		behavior: '-k 2,3 compares the complete selected key range',
		expected: 'z k a\ny k b',
		input: 'y k b\nz k a\n',
		name: '07c',
		options: '-k 2,3',
	},
	{
		behavior: 'character end position zero includes the whole field',
		expected: 'z a a\na a b',
		input: 'a a b\nz a a\n',
		name: '07e',
		options: '-k 2,3.0',
	},
	{
		behavior: 'ignored empty key ranges leave input in fallback order',
		expected: 'a 2\nb 1',
		input: 'a 2\nb 1\n',
		name: '07f',
		options: '-n -k1.3,1.1',
	},
	{
		behavior: 'key ends before key starts are ignored across fields',
		expected: 'aa 2\nbb 1',
		input: 'aa 2\nbb 1\n',
		name: '07g',
		options: '-n -k2.2,1.2',
	},
	{
		behavior: '-n keeps exponent-like values in numeric-prefix order',
		expected: '1e2\n2e1',
		input: '1e2\n2e1\n',
		name: '09b',
		options: '-n',
	},
	{
		behavior:
			'-n does not treat exponent notation as general numeric input',
		expected: '1e2\n2e1',
		input: '2e1\n1e2\n',
		name: '09c',
		options: '-n',
	},
	{
		behavior: '-t with character offsets preserves already sorted input',
		expected: ':ba\n:ab',
		input: ':ba\n:ab\n',
		name: '10a',
		options: '-t : -k 2.2,2.2',
	},
	{
		behavior: '-t with character offsets sorts by the selected key byte',
		expected: ':ba\n:ab',
		input: ':ab\n:ba\n',
		name: '10c',
		options: '-t : -k 2.2,2.2',
	},
	{
		behavior: 'character offsets count delimiter blanks without -t',
		expected: 'z ba\nz ab',
		input: 'z ba\nz ab\n',
		name: '10a0',
		options: '-k 2.3,2.3',
	},
	{
		behavior: 'single-field character offsets can preserve input order',
		expected: 'ba\nab',
		input: 'ba\nab\n',
		name: '10a1',
		options: '-k 1.2,1.2',
	},
	{
		behavior: 'single-field character offsets sort by selected byte',
		expected: 'ba\nab',
		input: 'ab\nba\n',
		name: '10e',
		options: '-k 1.2,1.2',
	},
	{
		behavior: '-t character offsets can select bytes after an empty field',
		expected: ':ba\n:ab',
		input: ':ab\n:ba\n',
		name: '10f',
		options: '-t : -k 1.3,1.3',
	},
	{
		behavior:
			'character offsets include delimiter spaces in field positions',
		expected: 'b ba\na ab',
		input: 'a ab\nb ba\n',
		name: '10g',
		options: '-k 1.4,1.4',
	},
	{
		behavior: '-c accepts a long single-line input',
		expected: '',
		input: `${'x'.repeat(30)}\n`,
		name: '17',
		options: '-c',
	},
	{
		behavior: 'default ordering handles repeated long symbol-like lines',
		expected:
			'_________U___iob\n_________U__abort\n_________U__abort\n_________U__fprintf\n_________U__free\n_________U__malloc\n_________U__malloc\n_________U__memcpy\n_________U__memset\n_________U_dyld_stub_binding_helper',
		input: '_________U__free\n_________U__malloc\n_________U__abort\n_________U__memcpy\n_________U__memset\n_________U_dyld_stub_binding_helper\n_________U__malloc\n_________U___iob\n_________U__abort\n_________U__fprintf\n',
		name: '20a',
		options: '',
	},
	{
		behavior: '-n orders negative numbers by numeric value',
		expected: '-9\n-1',
		input: '-1\n-9\n',
		name: 'neg-nls',
		options: '-n',
	},
	{
		behavior: 'default ordering compares NUL bytes within line text',
		expected: '\0a\n\0b',
		input: '\0b\n\0a\n',
		name: 'nul-nls',
		options: '',
	},
	{
		behavior: 'empty lines sort before lines beginning with tab',
		expected: '\n\t',
		input: '\n\t\n',
		name: 'use-nl',
		options: '',
	},
	{
		behavior: 'default C-locale ordering places underscore between A and a',
		expected: 'A\n_\na',
		input: 'A\na\n_\n',
		name: '21a',
		options: '',
	},
] as const satisfies readonly SortPipeCase[];

for (const testCase of SORT_PL_CASES) {
	test(`gnu sort: sort.pl ${testCase.name} - ${testCase.behavior}`, async () => {
		await setTextFile(fs, INPUT_PATH, testCase.input);

		const command =
			testCase.options === ''
				? `sort < ${INPUT_PATH}`
				: `sort ${testCase.options} < ${INPUT_PATH}`;

		expect(await $`${command}`.text()).toBe(testCase.expected);
	});
}

test('gnu sort: sort.pl triple_test - reads input from a named virtual file', async () => {
	await setTextFile(fs, '/input', 'B\nA\n');

	expect(await $`sort /input`.text()).toBe('A\nB');
});

test('gnu sort: sort.pl triple_test - reads input from a pipeline', async () => {
	await setTextFile(fs, '/input', '11\n2\n');

	expect(await $`cat /input | sort -n`.text()).toBe('2\n11');
});

test('gnu sort: sort.pl triple_test - merges records from multiple file operands before sorting', async () => {
	await setTextFile(fs, '/left', 'b\n');
	await setTextFile(fs, '/right', 'a\nc\n');

	expect(await $`sort /left /right`.text()).toBe('a\nb\nc');
});
