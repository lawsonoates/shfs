// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/backref
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/backref-word
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/case-fold-backref
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/case-fold-backslash-w
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/case-fold-char-class
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/case-fold-char-range
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/case-fold-char-type
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/dfa-coverage
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/dfa-heap-overrun
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/dfaexec-multibyte
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/inconsistent-range
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/high-bit-range
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/invalid-multibyte-infloop
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/repetition-overflow
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/reversed-range-endpoints
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/warn-char-classes
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/unibyte-negated-circumflex
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '../../../../harness';

const harness = Harness.create();

async function status(command: string): Promise<number> {
	return (await harness.runWithStatus(command)).status;
}

test('gnu grep: backref - palindrome, bond stress pattern, and invalid backref handling', async () => {
	expect(
		await status(
			`echo radar | grep -e ${Harness.quote('\\(.\\)\\(.\\).\\2\\1')}`
		)
	).toBe(0);

	expect(
		await status(
			`echo civic | grep -E -e ${Harness.quote('^(.?)(.?)(.?)(.?)(.?)(.?)(.?)(.?)(.).?\\9\\8\\7\\6\\5\\4\\3\\2\\1$')}`
		)
	).toBe(0);

	expect(
		await status(
			`echo 123 | grep -e ${Harness.quote('a\\(.\\)')} -e ${Harness.quote('b\\1')}`
		)
	).toBe(2);

	expect(
		await status(
			`echo 123 | grep -e ${Harness.quote('[')} -e ${Harness.quote(']')}`
		)
	).toBe(2);
});

test('gnu grep: backref-word + case-fold-backref - -w and -i preserve captured backreferences', async () => {
	await harness.setTextFile(
		'/tmp/exp1.txt',
		'foo foo bar\nFoo foo\nFOO foo\n'
	);

	const word = await harness.runWithStatus(
		`grep -w ${Harness.quote('\\(foo\\) \\1')} /tmp/exp1.txt`
	);
	expect(word.status).toBe(0);
	expect(word.output).toBe('foo foo bar');

	const folded = await harness.runWithStatus(
		`grep -Ei ${Harness.quote('(foo) \\1')} /tmp/exp1.txt`
	);
	expect(folded.status).toBe(0);
	expect(folded.output).toBe('foo foo bar\nFoo foo\nFOO foo');
});

test('gnu grep: case-fold-backslash-w + case-fold-char-class + case-fold-char-range + case-fold-char-type - case folding preserves word and character class semantics', async () => {
	expect(
		await status(`echo foo bar | grep -i ${Harness.quote('^foo\\W')}`)
	).toBe(0);

	await harness.setTextFile('/tmp/case-1.txt', 'X\nY\nZ\n');
	const classOne = await harness.runWithStatus(
		`grep -i ${Harness.quote('[y]')} /tmp/case-1.txt`
	);
	expect(classOne.status).toBe(0);
	expect(classOne.output).toBe('Y');

	await harness.setTextFile('/tmp/case-2.txt', 'x\ny\nz\n');
	const classTwo = await harness.runWithStatus(
		`grep -i ${Harness.quote('[Y]')} /tmp/case-2.txt`
	);
	expect(classTwo.status).toBe(0);
	expect(classTwo.output).toBe('y');

	await harness.setTextFile('/tmp/range-1.txt', 'A\n1\nZ\n.\n');
	const rangeOne = await harness.runWithStatus(
		`grep -i ${Harness.quote('[a-z]')} /tmp/range-1.txt`
	);
	expect(rangeOne.status).toBe(0);
	expect(rangeOne.output).toBe('A\nZ');

	await harness.setTextFile('/tmp/range-2.txt', 'a\n1\nz\n.\n');
	const rangeTwo = await harness.runWithStatus(
		`grep -i ${Harness.quote('[A-Z]')} /tmp/range-2.txt`
	);
	expect(rangeTwo.status).toBe(0);
	expect(rangeTwo.output).toBe('a\nz');

	await harness.setTextFile('/tmp/type-1.txt', '1\nY\n.\n');
	const typeOne = await harness.runWithStatus(
		`grep -i ${Harness.quote('[[:lower:]]')} /tmp/type-1.txt`
	);
	expect(typeOne.status).toBe(0);
	expect(typeOne.output).toBe('Y');

	await harness.setTextFile('/tmp/type-2.txt', '1\ny\n.\n');
	const typeTwo = await harness.runWithStatus(
		`grep -i ${Harness.quote('[[:upper:]]')} /tmp/type-2.txt`
	);
	expect(typeTwo.status).toBe(0);
	expect(typeTwo.output).toBe('y');
});

test('gnu grep: dfa-coverage + dfa-heap-overrun - regression cases keep correct statuses', async () => {
	await harness.setTextFile('/tmp/in.txt', 'a\n');
	const coverage = await harness.runWithStatus(
		`grep -E ${Harness.quote('[^_]|$')} /tmp/in.txt`
	);
	expect(coverage.status).toBe(0);
	expect(coverage.output).toBe('a');

	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');
	expect(
		await status(
			`grep -E ${Harness.quote('(^| )*(a|b)*(c|d)*( |$)')} < /dev/null`
		)
	).toBe(1);
});

test('gnu grep: dfaexec-multibyte - alternation and character-class repetition remain equivalent', async () => {
	await harness.setTextFile('/tmp/letters.txt', 'aa\nab\nba\nbb\n');
	await harness.setTextFile('/tmp/digits.txt', '1 2 3\n');

	const ab = await harness.runWithStatus(
		`grep -E ${Harness.quote('([a]|[b]){2}')} /tmp/letters.txt`
	);
	expect(ab.status).toBe(0);
	expect(ab.output).toBe('aa\nab\nba\nbb');

	const ba = await harness.runWithStatus(
		`grep -E ${Harness.quote('([b]|[a]){2}')} /tmp/letters.txt`
	);
	expect(ba.status).toBe(0);
	expect(ba.output).toBe('aa\nab\nba\nbb');

	const digits = await harness.runWithStatus(
		`grep -E ${Harness.quote('^([[:digit:]]+[[:space:]]+){2}')} /tmp/digits.txt`
	);
	expect(digits.status).toBe(0);
	expect(digits.output).toBe('1 2 3');
});

test('gnu grep: inconsistent-range - equivalent uppercase predicates agree', async () => {
	await harness.setTextFile('/tmp/in.txt', '00a\n00g\n00z\n00A\n00G\n00Z\n');

	const doubled = await harness.runWithStatus(
		`grep -E ${Harness.quote('(.)\\1[A-Z]')} /tmp/in.txt`
	);
	const ranged = await harness.runWithStatus(
		`grep -E ${Harness.quote('[A-Z]')} /tmp/in.txt`
	);

	expect(doubled.status).toBe(0);
	expect(ranged.status).toBe(0);
	expect(doubled.output).toBe(ranged.output);
});

test('gnu grep: high-bit-range - single high-bit character remains matchable in bracket expression', async () => {
	const input = '\u0081\n';
	await harness.setTextFile('/tmp/in.txt', input);

	const result = await harness.runWithStatus(
		`grep ${Harness.quote('[\u0081]')} /tmp/in.txt`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('\u0081');
});

test('gnu grep: invalid-multibyte-infloop - -F with invalid byte pattern returns no match', async () => {
	await harness.setFile('/tmp/search-str', new Uint8Array([0x82]));
	await harness.setFile('/tmp/input', new Uint8Array([0x82, 0x82]));

	const result = await harness.runWithStatus(
		'grep -F -f /tmp/search-str /tmp/input'
	);
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
});

test('gnu grep: repetition-overflow - excessive repetition counts fail with status 2', async () => {
	const xp1 = '4294967297';
	const xp2 = '4294967298';

	const one = await harness.runWithStatus(
		`echo abc | grep -E ${Harness.quote(`b{${xp1}}`)}`
	);
	expect(one.status).toBe(2);
	expect(one.output).toBe('');

	const two = await harness.runWithStatus(
		`echo abbc | grep -E ${Harness.quote(`b{1,${xp2}}`)}`
	);
	expect(two.status).toBe(2);
	expect(two.output).toBe('');
});

test('gnu grep: reversed-range-endpoints - invalid ranges return status 2', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	for (const cmd of [
		`grep ${Harness.quote('[b-a]')} < /dev/null`,
		`grep -E ${Harness.quote('[b-a]')} < /dev/null`,
	]) {
		const result = await harness.runWithStatus(cmd);
		expect(result.status).toBe(2);
	}
});

test('gnu grep: warn-char-classes - diagnose [:space:] typo and accept valid forms', async () => {
	await harness.setTextFile('/tmp/x', 'f\nb\nh\n');

	const invalid = await harness.runWithStatus(
		`grep ${Harness.quote('[:space:]')} /tmp/x`
	);
	expect(invalid.status).toBe(2);

	const valid = await harness.runWithStatus(
		`grep ${Harness.quote('[[:space:]]')} /tmp/x`
	);
	expect(valid.status).toBe(1);

	for (const pattern of [
		'[::]',
		'[:space]',
		'[:space:wxyz]',
		'[:space[:space:]:]',
		'[:spac-e:]',
	]) {
		const result = await harness.runWithStatus(
			`grep ${Harness.quote(pattern)} /tmp/x`
		);
		expect(result.status).toBe(1);
	}
});

test('gnu grep: unibyte-negated-circumflex - [^^-^] remains a true negated class', async () => {
	await harness.setTextFile('/tmp/in', 'a\n');
	const result = await harness.runWithStatus(
		`grep ${Harness.quote('[^^-^]')} /tmp/in`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('a');
});
