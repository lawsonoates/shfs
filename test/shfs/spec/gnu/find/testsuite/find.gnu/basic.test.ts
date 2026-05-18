// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.gnu/iname.exp
// - find/testsuite/find.gnu/ipath.exp
// - find/testsuite/find.gnu/wholename.exp
// - find/testsuite/find.gnu/iwholename.exp
// - find/testsuite/find.gnu/regex1.exp
// - find/testsuite/find.gnu/iregex1.exp
// - find/testsuite/find.gnu/true.exp
// - find/testsuite/find.gnu/false.exp
// - find/testsuite/find.gnu/empty.exp
// Copyright (C) 2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { Harness } from '#harness';

const FIND_GNU_TESTSUITE_DIR = new URL('./', import.meta.url);
const TRAILING_NEWLINE_REGEX = /\n$/;

const harness = Harness.create();

interface FindGnuCase {
	name: string;
	command: string;
	setup: () => Promise<void>;
}

const FIND_GNU_CASES: readonly FindGnuCase[] = [
	{
		name: 'iname',
		command: 'find tmp -iname frED -print',
		setup: async () => {
			await harness.ensureDir('/tmp/fred');
			await harness.ensureDir('/tmp/jim');
		},
	},
	{
		name: 'ipath',
		command: 'find tmp/top -ipath Tmp/TOP/one -print',
		setup: async () => {
			await harness.ensureDir('/tmp/top/ONE/two');
		},
	},
	{
		name: 'wholename',
		command: 'find tmp/top -wholename tmp/top/one -print',
		setup: async () => {
			await harness.ensureDir('/tmp/top/one/two');
		},
	},
	{
		name: 'iwholename',
		command: 'find tmp/top -iwholename tmP/TOP/One -print',
		setup: async () => {
			await harness.ensureDir('/tmp/top/one/two');
		},
	},
	{
		name: 'regex1',
		command: "find tmp -regex 'tmp\\(/d\\)*' -print",
		setup: async () => {
			await harness.ensureDir('/tmp/d/d/d/e');
		},
	},
	{
		name: 'iregex1',
		command: "find tmp -iregex 'tmp\\(/d\\)*' -print",
		setup: async () => {
			await harness.ensureDir('/tmp/d/D/d/e');
		},
	},
	{
		name: 'true',
		command: 'find tmp -depth -true',
		setup: async () => {
			await harness.ensureDir('/tmp/fred/jim');
		},
	},
	{
		name: 'false',
		command: 'find tmp -depth -false',
		setup: async () => {
			await harness.ensureDir('/tmp/fred/jim');
		},
	},
	{
		name: 'empty',
		command: 'find tmp -type f -empty',
		setup: async () => {
			await harness.ensureDir('/tmp');
			await harness.setTextFile('/tmp/empty', '');
			await harness.setTextFile('/tmp/notempty', '\n');
		},
	},
] as const;

for (const testCase of FIND_GNU_CASES) {
	test(`gnu find: ${testCase.name}.exp - matches GNU findutils expected output`, async () => {
		await testCase.setup();

		const result = await harness.runWithStatus(testCase.command);
		expect(result.status).toBe(0);
		expect(result.output).toBe(readExpectedText(`${testCase.name}.xo`));
	});
}

function readExpectedText(relativePath: string): string {
	return readFileSync(
		new URL(relativePath, FIND_GNU_TESTSUITE_DIR),
		'utf8'
	).replace(TRAILING_NEWLINE_REGEX, '');
}
