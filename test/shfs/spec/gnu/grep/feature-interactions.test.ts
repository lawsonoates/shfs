// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/foad1
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/yesno
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/khadafy
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/khadafy.regexp
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/khadafy.lines
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: Copying and distribution of this file, with or without modification,
// are permitted in any medium without royalty provided the copyright notice and
// this notice are preserved.

import { expect, test } from 'bun:test';

import { createGrepHarness, quote, readFixture } from './harness';

const harness = createGrepHarness();

test('gnu grep: foad1 - -o with -i returns original matching text casing', async () => {
	await harness.setTextFile('/tmp/in.txt', 'WordA\nwordB\nWORDC\n');

	for (const pattern of ['word', 'Word', 'WORD']) {
		const result = await harness.runWithStatus(
			`grep ${quote(pattern)} -o -i /tmp/in.txt`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe('Word\nword\nWORD');
	}
});

test('gnu grep: foad1 - -o with -n and -b reports every match, not only first per line', async () => {
	await harness.setTextFile('/tmp/in1.txt', 'wA wB\nwC\n');
	await harness.setTextFile('/tmp/in2.txt', 'XwA YwB\nZwC\n');

	const numbered = await harness.runWithStatus(
		`grep ${quote('w.')} -o -n /tmp/in1.txt`
	);
	expect(numbered.status).toBe(0);
	expect(numbered.output).toBe('1:wA\n1:wB\n2:wC');

	const offset = await harness.runWithStatus(
		`grep ${quote('w.')} -o -b /tmp/in2.txt`
	);
	expect(offset.status).toBe(0);
	expect(offset.output).toBe('1:wA\n5:wB\n9:wC');
});

test('gnu grep: foad1 - -H and -h precedence matches GNU expectation', async () => {
	await harness.setTextFile('/tmp/in.txt', 'wA wB\n');

	const plain = await harness.runWithStatus(
		`grep ${quote('w.')} /tmp/in.txt`
	);
	expect(plain.status).toBe(0);
	expect(plain.output).toBe('wA wB');

	const withH = await harness.runWithStatus(
		`grep ${quote('w.')} -H /tmp/in.txt`
	);
	expect(withH.status).toBe(0);
	expect(withH.output).toBe('/tmp/in.txt:wA wB');

	const hThenH = await harness.runWithStatus(
		`grep ${quote('w.')} -h -H /tmp/in.txt`
	);
	expect(hThenH.status).toBe(0);
	expect(hThenH.output).toBe('/tmp/in.txt:wA wB');

	const hWinsUntilOverridden = await harness.runWithStatus(
		`grep ${quote('w.')} -H -h /tmp/in.txt`
	);
	expect(hWinsUntilOverridden.status).toBe(0);
	expect(hWinsUntilOverridden.output).toBe('wA wB');
});

test('gnu grep: foad1 - end of previous match does not satisfy a new start-of-word assertion', async () => {
	await harness.setTextFile('/tmp/word-underscore.txt', 'word_word\n');
	await harness.setTextFile('/tmp/wordword.txt', 'wordword\n');

	const a = await harness.runWithStatus(
		`grep ${quote('^word_*')} -o /tmp/word-underscore.txt`
	);
	expect(a.status).toBe(0);
	expect(a.output).toBe('word_');

	const b = await harness.runWithStatus(
		`grep ${quote('\\<word')} -o /tmp/wordword.txt`
	);
	expect(b.status).toBe(0);
	expect(b.output).toBe('word');
});

test('gnu grep: foad1 + max-count-vs-context - -m with anchors and context obeys first selected line', async () => {
	await harness.setTextFile('/tmp/in.txt', '4\n40\n');

	const exact = await harness.runWithStatus(
		`grep ${quote('^4$')} -m1 -A99 /tmp/in.txt`
	);
	expect(exact.status).toBe(0);
	expect(exact.output).toBe('4\n40');

	const begin = await harness.runWithStatus(
		`grep ${quote('^4')} -m1 -A99 /tmp/in.txt`
	);
	expect(begin.status).toBe(0);
	expect(begin.output).toBe('4');

	const end = await harness.runWithStatus(
		`grep ${quote('4$')} -m1 -A99 /tmp/in.txt`
	);
	expect(end.status).toBe(0);
	expect(end.output).toBe('4\n40');
});

test('gnu grep: foad1 - -F -w with multiple -e patterns keeps true word boundaries', async () => {
	await harness.setTextFile('/tmp/in.txt', 'A\nCX\nB\nC\n');
	const result = await harness.runWithStatus(
		'grep -wF -e A -e B -e C /tmp/in.txt'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('A\nB\nC');

	await harness.setTextFile('/tmp/in2.txt', 'LIN7C 55327\n');
	const noMatch = await harness.runWithStatus(
		'grep -wF -e 5327 -e 5532 /tmp/in2.txt'
	);
	expect(noMatch.status).toBe(1);
	expect(noMatch.output).toBe('');
});

test('gnu grep: yesno - interaction of -C, -v, -o, and -m preserves line and byte offsets', async () => {
	await harness.setTextFile(
		'/tmp/yesno.txt',
		[
			'[A01 no ]',
			'[B02 no ]',
			'[C03 yes]',
			'[D04 yes]',
			'[E05 yes]',
			'[F06 no ]',
			'[G07 no ]',
			'[H08 yes]',
			'[I09 yes]',
			'[J10 no ]',
			'[K11 no ]',
			'[L12 no ]',
			'[M13 yes]',
			'[N14 yes]',
			'',
		].join('\n')
	);

	const plain = await harness.runWithStatus(
		'grep -F -n -b yes /tmp/yesno.txt'
	);
	expect(plain.status).toBe(0);
	expect(plain.output).toBe(
		[
			'3:20:[C03 yes]',
			'4:30:[D04 yes]',
			'5:40:[E05 yes]',
			'8:70:[H08 yes]',
			'9:80:[I09 yes]',
			'13:120:[M13 yes]',
			'14:130:[N14 yes]',
		].join('\n')
	);

	const only = await harness.runWithStatus(
		'grep -F -n -b -o yes /tmp/yesno.txt'
	);
	expect(only.status).toBe(0);
	expect(only.output).toBe(
		[
			'3:25:yes',
			'4:35:yes',
			'5:45:yes',
			'8:75:yes',
			'9:85:yes',
			'13:125:yes',
			'14:135:yes',
		].join('\n')
	);

	const withContext = await harness.runWithStatus(
		'grep -F -n -b -C 1 yes /tmp/yesno.txt'
	);
	expect(withContext.status).toBe(0);
	expect(withContext.output).toBe(
		[
			'2-10-[B02 no ]',
			'3:20:[C03 yes]',
			'4:30:[D04 yes]',
			'5:40:[E05 yes]',
			'6-50-[F06 no ]',
			'7-60-[G07 no ]',
			'8:70:[H08 yes]',
			'9:80:[I09 yes]',
			'10-90-[J10 no ]',
			'--',
			'12-110-[L12 no ]',
			'13:120:[M13 yes]',
			'14:130:[N14 yes]',
		].join('\n')
	);

	const inverted = await harness.runWithStatus(
		'grep -F -n -b -v yes /tmp/yesno.txt'
	);
	expect(inverted.status).toBe(0);
	expect(inverted.output).toBe(
		[
			'1:0:[A01 no ]',
			'2:10:[B02 no ]',
			'6:50:[F06 no ]',
			'7:60:[G07 no ]',
			'10:90:[J10 no ]',
			'11:100:[K11 no ]',
			'12:110:[L12 no ]',
		].join('\n')
	);

	const maxFour = await harness.runWithStatus(
		'grep -F -n -b -m 4 yes /tmp/yesno.txt'
	);
	expect(maxFour.status).toBe(0);
	expect(maxFour.output).toBe(
		[
			'3:20:[C03 yes]',
			'4:30:[D04 yes]',
			'5:40:[E05 yes]',
			'8:70:[H08 yes]',
		].join('\n')
	);
});

test('gnu grep: khadafy - regexp file selects exactly the expected lines corpus', async () => {
	const regex = readFixture('khadafy.regexp');
	const lines = readFixture('khadafy.lines');

	await harness.setTextFile('/tmp/khadafy.regexp', regex);
	await harness.setTextFile('/tmp/khadafy.lines', lines);

	const result = await harness.runWithStatus(
		'grep -E -f /tmp/khadafy.regexp /tmp/khadafy.lines'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe(lines.trimEnd());
});
