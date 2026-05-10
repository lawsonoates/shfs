// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/backslash-s-and-repetition-operators
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/backslash-s-vs-invalid-multibyte
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/char-class-multibyte
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/char-class-multibyte2
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/prefix-of-multibyte
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/fgrep-infloop
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/bogus-wctob
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/empty-line-mb
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/surrogate-pair
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/multibyte-white-space
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/turkish-I
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/turkish-I-without-dot
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../harness';

const harness = Harness.create();

test('gnu grep: backslash-s-and-repetition-operators - \\s and \\S support repetition operators', async () => {
	await harness.setTextFile('/tmp/in-space', ' \n');

	for (const re of ['\\s\\+', '\\s*', '\\s\\?', '\\s\\{1\\}']) {
		const result = await harness.runWithStatus(
			`grep ${Harness.quote(`^${re}$`)} /tmp/in-space`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe(' ');
	}

	await harness.setTextFile('/tmp/in-char', 'X\n');
	for (const re of ['\\S\\+', '\\S*', '\\S\\?', '\\S\\{1\\}']) {
		const result = await harness.runWithStatus(
			`grep ${Harness.quote(`^${re}$`)} /tmp/in-char`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe('X');
	}
});

test('gnu grep: backslash-s-vs-invalid-multibyte - invalid multibyte never matches \\s or \\S', async () => {
	await harness.setFile('/tmp/in.bin', new Uint8Array([0x82, 0x0a]));

	const upper = await harness.runWithStatus(
		`grep ${Harness.quote('^\\S$')} /tmp/in.bin`
	);
	expect(upper.status).toBe(1);
	expect(upper.output).toBe('');

	const lower = await harness.runWithStatus(
		`grep ${Harness.quote('^\\s$')} /tmp/in.bin`
	);
	expect(lower.status).toBe(1);
	expect(lower.output).toBe('');
});

test('gnu grep: char-class-multibyte + char-class-multibyte2 - accented characters remain stable in classes and groups', async () => {
	await harness.setTextFile('/tmp/accented-lower.txt', 'á\nç\né\n');
	await harness.setTextFile('/tmp/accented-upper.txt', 'Á\nÇ\nÉ\n');

	const lower = await harness.runWithStatus(
		`grep ${Harness.quote('[é]')} /tmp/accented-lower.txt`
	);
	expect(lower.status).toBe(0);
	expect(lower.output).toBe('é');

	const upper = await harness.runWithStatus(
		`grep ${Harness.quote('[É]')} /tmp/accented-upper.txt`
	);
	expect(upper.status).toBe(0);
	expect(upper.output).toBe('É');

	const grouped = await harness.runWithStatus(
		`grep -E ${Harness.quote('([^.]*[é]){1,2}')} /tmp/accented-lower.txt`
	);
	expect(grouped.status).toBe(0);
	expect(grouped.output).toBe('é');

	await harness.setFile(
		'/tmp/invalid-byte.txt',
		new Uint8Array([0xc3, 0x0a])
	);
	const invalid = await harness.runWithStatus(
		`grep ${Harness.quote('[é]')} /tmp/invalid-byte.txt`
	);
	expect(invalid.status).toBe(1);
});

test('gnu grep: prefix-of-multibyte - byte prefixes of UTF-8 characters are not standalone matches', async () => {
	await harness.setFile('/tmp/prefix.txt', new Uint8Array([0xef]));
	await harness.setFile(
		'/tmp/input.txt',
		new Uint8Array([0xef, 0xbc, 0xa1, 0x0a])
	);

	for (const opt of ['', '-F']) {
		const result = await harness.runWithStatus(
			`grep ${opt} -f /tmp/prefix.txt /tmp/input.txt`
		);
		expect(result.status).toBe(1);
		expect(result.output).toBe('');
	}
});

test('gnu grep: fgrep-infloop - fixed-string search over malformed multibyte fragments returns no match', async () => {
	await harness.setFile('/tmp/needle.bin', new Uint8Array([0xbc, 0xa1]));
	await harness.setFile(
		'/tmp/input.bin',
		new Uint8Array([0xef, 0xbc, 0xa1, 0x0a])
	);

	const result = await harness.runWithStatus(
		'grep -F -f /tmp/needle.bin /tmp/input.bin'
	);
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
});

test('gnu grep: bogus-wctob - bracket expression must not mis-match invalid high byte', async () => {
	await harness.setFile('/tmp/in.bin', new Uint8Array([0xe0, 0x0a]));
	const result = await harness.runWithStatus(
		`grep ${Harness.quote('[à]')} /tmp/in.bin`
	);

	// GNU test accepts either no-match (1) or syntax failure would be hard error (2).
	// The regression specifically disallows a false positive status 0.
	expect(result.status).not.toBe(0);
});

test('gnu grep: empty-line-mb - ^$ with -n -i reports only truly empty lines', async () => {
	await harness.setTextFile('/tmp/in.txt', 'a\n\nb\n');
	await harness.setTextFile('/tmp/in2.txt', 'a\nb\n');

	const first = await harness.runWithStatus(
		`grep -n -i ${Harness.quote('^$')} /tmp/in.txt`
	);
	expect(first.status).toBe(0);
	expect(first.output).toBe('2:');

	const second = await harness.runWithStatus(
		`grep -i ${Harness.quote('^$')} /tmp/in2.txt`
	);
	expect(second.status).toBe(1);
	expect(second.output).toBe('');
});

test('gnu grep: surrogate-pair - non-BMP data must not crash and remains searchable', async () => {
	const pair = '𐐅';
	await harness.setTextFile('/tmp/in.txt', `${pair}\n`);

	const noMatch = await harness.runWithStatus(
		'grep -i anything-else /tmp/in.txt'
	);
	expect(noMatch.status).toBe(1);
	expect(noMatch.output).toBe('');

	for (const opt of ['', '-i', '-E', '-F', '-i -E', '-i -F']) {
		const match = await harness.runWithStatus(
			`grep --file=/tmp/in.txt ${opt} /tmp/in.txt`
		);
		expect(match.status).toBe(0);
		expect(match.output).toBe(pair);
	}
});

test('gnu grep: multibyte-white-space - UTF-8 whitespace code points satisfy \\s and not \\S', async () => {
	const spaces = [
		'\u0009',
		'\u000b',
		'\u000c',
		'\u000d',
		'\u0020',
		'\u1680',
		'\u2000',
		'\u2001',
		'\u2002',
		'\u2003',
		'\u2004',
		'\u2005',
		'\u2006',
		'\u2008',
		'\u2009',
		'\u200a',
		'\u205f',
		'\u3000',
	];

	for (const ch of spaces) {
		await harness.setTextFile('/tmp/ws.txt', `${ch}\n`);

		const ws = await harness.runWithStatus(
			`grep -q ${Harness.quote('^\\s$')} /tmp/ws.txt`
		);
		expect(ws.status).toBe(0);

		const notWs = await harness.runWithStatus(
			`grep -q ${Harness.quote('\\S')} /tmp/ws.txt`
		);
		expect(notWs.status).toBe(1);
	}
});

test('gnu grep: turkish-I + turkish-I-without-dot - -i with multi-byte case mappings preserves full lines', async () => {
	const dottedCapitalI = 'İ';
	await harness.setTextFile(
		'/tmp/dotted.txt',
		`${dottedCapitalI.repeat(7)}\n`
	);

	const dottedResult = await harness.runWithStatus(
		'grep -i .... /tmp/dotted.txt'
	);
	expect(dottedResult.status).toBe(0);
	expect(dottedResult.output).toBe(dottedCapitalI.repeat(7));

	await harness.setTextFile('/tmp/ascii-i.txt', 'IIIIIII\n');
	const asciiResult = await harness.runWithStatus(
		'grep -i .... /tmp/ascii-i.txt'
	);
	expect(asciiResult.status).toBe(0);
	expect(asciiResult.output).toBe('IIIIIII');

	const mixed = `I${dottedCapitalI}`.repeat(7);
	await harness.setTextFile('/tmp/mixed-i.txt', `${mixed}\n`);
	const mixedResult = await harness.runWithStatus(
		'grep -i .... /tmp/mixed-i.txt'
	);
	expect(mixedResult.status).toBe(0);
	expect(mixedResult.output).toBe(mixed);
});
