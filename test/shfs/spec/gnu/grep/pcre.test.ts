// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/pcre
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/pcre-abort
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/pcre-invalid-utf8-input
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/pcre-utf8
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/pcre-z
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { createGrepHarness, quote } from './harness';

const harness = createGrepHarness();

test('gnu grep: pcre - with -P, \\s*$ matches an empty line', async () => {
	const result = await harness.runWithStatus(
		`echo '' | grep -P ${quote('\\s*$')}`
	);
	expect(result.status).toBe(0);
});

test('gnu grep: pcre-abort - catastrophic backtracking reports status 2 without output', async () => {
	await harness.setTextFile(
		'/tmp/in.txt',
		'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab\n'
	);

	const result = await harness.runWithStatus(
		`grep -P ${quote('((a+)*)+$')} /tmp/in.txt`
	);
	expect(result.status).toBe(2);
	expect(result.output).toBe('');
});

test('gnu grep: pcre-invalid-utf8-input - -P handles invalid UTF-8 input bytes without aborting', async () => {
	await harness.setFile(
		'/tmp/in.bin',
		new Uint8Array([0x6a, 0x82, 0x0a, 0x6a, 0x0a])
	);

	const result = await harness.runWithStatus('grep -P j /tmp/in.bin');
	expect(result.status).toBe(0);
	const lines = result.output === '' ? [] : result.output.split('\n');
	expect(lines.length).toBe(2);
	for (const line of lines) {
		expect(line.startsWith('j')).toBe(true);
	}
});

test('gnu grep: pcre-utf8 - Unicode property classes and dot matching on UTF-8 input', async () => {
	await harness.setTextFile('/tmp/euro.txt', '€ euro\n');

	const symbol = await harness.runWithStatus(
		`grep -P ${quote('^\\p{S}')} /tmp/euro.txt`
	);
	expect(symbol.status).toBe(0);
	expect(symbol.output).toBe('€ euro');

	const anyThenEuro = await harness.runWithStatus(
		`grep -P ${quote('^. euro$')} /tmp/euro.txt`
	);
	expect(anyThenEuro.status).toBe(0);
	expect(anyThenEuro.output).toBe('€ euro');

	const onlyMatch = await harness.runWithStatus(
		`grep -oP ${quote('. euro')} /tmp/euro.txt`
	);
	expect(onlyMatch.status).toBe(0);
	expect(onlyMatch.output).toBe('€ euro');

	const nonSymbol = await harness.runWithStatus(
		`grep -P ${quote('^\\P{S}')} /tmp/euro.txt`
	);
	expect(nonSymbol.status).toBe(1);
	expect(nonSymbol.output).toBe('');
});

test('gnu grep: pcre-z - -Pz agrees with -z counts on NUL-delimited input', async () => {
	const input = new Uint8Array([
		0x61, 0x62, 0x63, 0x00, 0x64, 0x65, 0x66, 0x00, 0x67, 0x68, 0x69, 0x00,
		0x61, 0x61, 0x61, 0x00, 0x67, 0x61, 0x68, 0x00,
	]);
	await harness.setFile('/tmp/in.bin', input);

	const breCount = await harness.runWithStatus('grep -cz a /tmp/in.bin');
	expect(breCount.status).toBe(0);
	expect(breCount.output).toBe('3');

	const pcreCount = await harness.runWithStatus('grep -Pcz a /tmp/in.bin');
	expect(pcreCount.status).toBe(0);
	expect(pcreCount.output).toBe('3');
});
