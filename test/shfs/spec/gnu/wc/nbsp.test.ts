// Translated/adapted from GNU coreutils tests/wc/wc-nbsp.sh.
// Copyright (C) 2019-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();
const INPUT_PATH = '/nbsp-input';

const UTF8_SPACE_CASES = [
	{ codePoint: 'U+00A0', value: '\u00A0' },
	{ codePoint: 'U+2007', value: '\u2007' },
	{ codePoint: 'U+202F', value: '\u202F' },
	{ codePoint: 'U+2060', value: '\u2060' },
	{ codePoint: 'U+0020', value: '\u0020' },
	{ codePoint: 'U+2003', value: '\u2003' },
] as const;

async function setWrappedCharacter(value: string): Promise<void> {
	await harness.setTextFile(INPUT_PATH, `=${value}=`);
}

for (const { codePoint, value } of UTF8_SPACE_CASES) {
	test(`gnu wc: wc-nbsp.sh ${codePoint} - separates words when printable`, async () => {
		await setWrappedCharacter(value);

		const lineLength = await harness.run(`wc -L < ${INPUT_PATH}`);

		if (lineLength === '3') {
			expect(await harness.run(`wc -w < ${INPUT_PATH}`)).toBe('2');
		}
	});
}

// The upstream script conditionally checks ISO-8859-1 and KOI8-R bytes based on
// host locales. shfs does not emulate host locale tables, so this port keeps the
// deterministic UTF-8 cases.
