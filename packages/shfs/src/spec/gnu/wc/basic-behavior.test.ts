// Translated/adapted from GNU coreutils tests/wc/wc.pl.
// Copyright (C) 1997-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createWcHarness } from './harness';

const harness = createWcHarness();
const INPUT_PATH = '/stdin';

interface WcPipeCase {
	name: string;
	options: string;
	input: string;
	expected: string;
}

const WC_PL_CASES = [
	{ expected: '0', input: '', name: 'a0', options: '-c' },
	{ expected: '0', input: '', name: 'a1', options: '-l' },
	{ expected: '0', input: '', name: 'a2', options: '-w' },
	{ expected: '1', input: 'x', name: 'a3', options: '-c' },
	{ expected: '1', input: 'x', name: 'a4', options: '-w' },
	{ expected: '2', input: 'x y\n', name: 'a5', options: '-w' },
	{ expected: '3', input: 'x y\nz', name: 'a6', options: '-w' },
	{ expected: '0', input: 'x y', name: 'a7', options: '-l' },
	{ expected: '1', input: 'x y\n', name: 'a8', options: '-l' },
	{ expected: '2', input: 'x\ny\n', name: 'a9', options: '-l' },
	{
		expected: '      0       0       0',
		input: '',
		name: 'b0',
		options: '',
	},
	{
		expected: '      2       3       6',
		input: 'a b\nc\n',
		name: 'b1',
		options: '',
	},
	{ expected: '2', input: '1\n12\n', name: 'c0', options: '-L' },
	{ expected: '3', input: '1\n123\n1\n', name: 'c1', options: '-L' },
	{ expected: '6', input: '\n123456', name: 'c2', options: '-L' },
	{ expected: '1', input: '\x01\n', name: 'd1', options: '-w' },
] as const satisfies readonly WcPipeCase[];

for (const testCase of WC_PL_CASES) {
	test(`wc.pl ${testCase.name}: wc ${testCase.options}`.trim(), async () => {
		await harness.setTextFile(INPUT_PATH, testCase.input);

		const command =
			testCase.options === ''
				? `wc < ${INPUT_PATH}`
				: `wc ${testCase.options} < ${INPUT_PATH}`;

		expect(await harness.run(command)).toBe(testCase.expected);
	});
}
