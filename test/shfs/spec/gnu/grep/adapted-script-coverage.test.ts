// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/backref-multibyte-slow
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/big-hole
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/big-match
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/long-line-vs-2GiB-read
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/epipe
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/in-eq-out-infloop
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/fedora
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/fmbtest
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/euc-mb
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/sjis-mb
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/mb-non-UTF8-performance
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/equiv-classes
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/turkish-eyes
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/unibyte-bracket-expr
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/symlink
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

test('gnu grep: backref-multibyte-slow - nested backreference expression matches full corpus', async () => {
	const lines = Array.from({ length: 256 }, () => 'aba').join('\n');
	await harness.setTextFile('/tmp/in.txt', `${lines}\n`);

	const result = await harness.runWithStatus(
		`grep -E ${Harness.quote('^([a-z]).\\1$')} /tmp/in.txt`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe(lines);
});

test('gnu grep: big-hole - --binary-file=without-match suppresses matches in binary input', async () => {
	await harness.setFile(
		'/tmp/sparse-like.bin',
		new Uint8Array([0x61, 0x00, 0x62, 0x00, 0x78, 0x00])
	);

	const result = await harness.runWithStatus(
		'grep --binary-file=without-match x /tmp/sparse-like.bin'
	);
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
});

test('gnu grep: big-match + long-line-vs-2GiB-read - long matching lines remain searchable', async () => {
	const longPayload = `${'0'.repeat(1024 * 256)}x`;
	await harness.setTextFile('/tmp/big.txt', `${longPayload}\n`);

	const all = await harness.runWithStatus(
		`grep -a ${Harness.quote('^.*')} /tmp/big.txt`
	);
	expect(all.status).toBe(0);
	expect(all.output).toBe(longPayload);

	const backref = await harness.runWithStatus(
		`grep -a ${Harness.quote('^.*x\\(\\)\\1')} /tmp/big.txt`
	);
	expect(backref.status).toBe(0);
	expect(backref.output).toBe(longPayload);

	const list = await harness.runWithStatus('grep -l x /tmp/big.txt');
	expect(list.status).toBe(0);
	expect(list.output).toBe('/tmp/big.txt');
});

test('gnu grep: epipe - grep in a pipeline can terminate early without failure', async () => {
	const data = Array.from(
		{ length: 2000 },
		(_, index) => `line-${index}`
	).join('\n');
	await harness.setTextFile('/tmp/in.txt', `${data}\n`);

	const result = await harness.runWithStatus(
		'cat /tmp/in.txt | grep . | head -n 1'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('line-0');
});

test('gnu grep: in-eq-out-infloop - grep detects output redirection to an input source unless early-exit options apply', async () => {
	await harness.setTextFile('/tmp/out.txt', `${'0'.repeat(2048)}\n`);

	for (const arg of ['/tmp/out.txt', '-', '""']) {
		const guarded = await harness.runWithStatus(
			`grep 0 ${arg} < /tmp/out.txt >> /tmp/out.txt`
		);
		expect(guarded.status).toBe(2);

		for (const opt of ['-q', '-m1', '-l', '-L']) {
			const earlyExit = await harness.runWithStatus(
				`grep ${opt} 0 ${arg} < /tmp/out.txt >> /tmp/out.txt`
			);
			expect(earlyExit.status).not.toBe(2);
		}

		const forced = await harness.runWithStatus(
			`grep -2 0 ${arg} < /tmp/out.txt >> /tmp/out.txt`
		);
		expect(forced.status).toBe(2);
	}
});

test('gnu grep: fedora - -F -w list matching and -e ordering semantics', async () => {
	await harness.setTextFile('/tmp/list.txt', 'a\nb\nc\n');
	await harness.setTextFile('/tmp/in.txt', 'a\nbarn\nc\n');

	const fixedWord = await harness.runWithStatus(
		'grep -F -w -f /tmp/list.txt /tmp/in.txt'
	);
	expect(fixedWord.status).toBe(0);
	expect(fixedWord.output).toBe('a\nc');

	await harness.setTextFile('/tmp/one.txt', 'test\n');
	const secondEmptyPattern = await harness.runWithStatus(
		`cat /tmp/one.txt | grep -e ${Harness.quote('HighlightThis')} -e ''`
	);
	const firstEmptyPattern = await harness.runWithStatus(
		`cat /tmp/one.txt | grep -e '' -e ${Harness.quote('HighlightThis')}`
	);

	expect(secondEmptyPattern.status).toBe(0);
	expect(firstEmptyPattern.status).toBe(0);
	expect(secondEmptyPattern.output).toBe(firstEmptyPattern.output);
});

test('gnu grep: fmbtest - UTF-8 case folding works with pattern files and inline -e expressions', async () => {
	await harness.setTextFile(
		'/tmp/csinput',
		[
			'01 Žluťoučká číše',
			'ČíŠE 02',
			'10ČaSy se měnÍ',
			'ČÍšE11',
			'Čas12',
			'',
		].join('\n')
	);
	await harness.setTextFile('/tmp/cspatfile', 'ČÍšE\nČas\n');

	const fromFile = await harness.runWithStatus(
		'grep -Fi -f /tmp/cspatfile /tmp/csinput'
	);
	expect(fromFile.status).toBe(0);
	expect(fromFile.output).toContain('ČÍšE11');
	expect(fromFile.output).toContain('Čas12');

	const fromExpr = await harness.runWithStatus(
		`grep -Ei -e ${Harness.quote('ČÍšE')} -e ${Harness.quote('Čas')} /tmp/csinput`
	);
	expect(fromExpr.status).toBe(0);
	expect(fromExpr.output).toContain('ČÍšE11');
	expect(fromExpr.output).toContain('Čas12');
});

test('gnu grep: euc-mb + sjis-mb - multibyte boundaries do not create false single-byte matches', async () => {
	const fullWidthA = 'Ａ';
	await harness.setTextFile('/tmp/mb.txt', `${fullWidthA}${fullWidthA}\n`);

	const rejectAsciiA = await harness.runWithStatus('grep -F A /tmp/mb.txt');
	expect(rejectAsciiA.status).toBe(1);

	const rejectRegexA = await harness.runWithStatus('grep -E A /tmp/mb.txt');
	expect(rejectRegexA.status).toBe(1);

	const acceptWholeChar = await harness.runWithStatus(
		`grep -F ${Harness.quote(fullWidthA)} /tmp/mb.txt`
	);
	expect(acceptWholeChar.status).toBe(0);
	expect(acceptWholeChar.output).toBe(`${fullWidthA}${fullWidthA}`);
});

test('gnu grep: mb-non-UTF8-performance - non-matching large input returns status 1', async () => {
	const lines = Array.from(
		{ length: 5000 },
		(_, index) => `row-${index}`
	).join('\n');
	await harness.setTextFile('/tmp/in.txt', `${lines}\n`);

	const result = await harness.runWithStatus('grep -i foobar /tmp/in.txt');
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
});

test('gnu grep: equiv-classes - [[=a=]] includes accented variants under multibyte support', async () => {
	const result = await harness.runWithStatus(
		`echo à | grep ${Harness.quote('[[=a=]]')}`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('à');
});

test('gnu grep: turkish-eyes - dotted and dotless I sequence matches under -i in GNU order', async () => {
	const capitalIWithDot = 'İ';
	const dotlessI = 'ı';
	const data = `I:${capitalIWithDot} ${dotlessI}:i`;
	const search = `${dotlessI}:i I:${capitalIWithDot}`;

	await harness.setTextFile('/tmp/turkish.txt', `${data}\n`);
	const result = await harness.runWithStatus(
		`grep -Ei ${Harness.quote(search)} /tmp/turkish.txt`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe(data);
});

test('gnu grep: unibyte-bracket-expr - bracket literals round-trip for high-byte values', async () => {
	const samples = ['\u0080', '\u0090', '\u00a1', '\u00ff'];

	for (const sample of samples) {
		await harness.setTextFile('/tmp/in.txt', `${sample}\n`);
		const result = await harness.runWithStatus(
			`grep ${Harness.quote(`[${sample}]`)} /tmp/in.txt`
		);
		expect(result.status).toBe(0);
		expect(result.output).toBe(sample);
	}
});

async function setupGrepSymlinkFixture(): Promise<void> {
	await harness.run('mkdir -p /tmp/dir');
	await harness.setTextFile('/tmp/dir/a', 'a\n');
	await harness.setTextFile('/tmp/dir/b', 'b\n');
	await harness.fs.symlink('a', '/tmp/dir/c');
	await harness.fs.symlink('.', '/tmp/dir/d');
	await harness.fs.symlink('dangling', '/tmp/dir/e');
	await harness.run('cd /tmp/dir');
}

test('gnu grep: symlink - explicit glob operands search symlinked files and report dangling links', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(
		`grep ${Harness.quote('^')} * < a`
	);
	expect(result.status).toBe(2);
	expect(Harness.sortedLines(result.output)).toBe(
		['a:a', 'b:b', 'c:a'].join('\n')
	);
});

test('gnu grep: symlink - -r skips symlinks discovered during recursive traversal', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(`grep -r ${Harness.quote('^')}`);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe(['a:a', 'b:b'].join('\n'));
});

test('gnu grep: symlink - -r follows explicit symlink directory operands but not links beneath them', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(
		`grep -r ${Harness.quote('^')} * < a`
	);
	expect(result.status).toBe(2);
	expect(Harness.sortedLines(result.output)).toBe(
		['a:a', 'b:b', 'c:a', 'd/a:a', 'd/b:b'].join('\n')
	);
});

test('gnu grep: symlink - -R follows symlinked files discovered during recursive traversal', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(`grep -R ${Harness.quote('^')}`);
	expect(result.status).toBe(0);
	expect(Harness.sortedLines(result.output)).toBe(
		['a:a', 'b:b', 'c:a'].join('\n')
	);
});

test('gnu grep: symlink - -R follows an explicit symlink file operand', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(
		`grep -R ${Harness.quote('^')} c`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('c:a');
});

test('gnu grep: symlink - -R follows explicit symlink directory operands', async () => {
	await setupGrepSymlinkFixture();

	const result = await harness.runWithStatus(
		`grep -R ${Harness.quote('^')} * < a`
	);
	expect(result.status).toBe(2);
	expect(Harness.sortedLines(result.output)).toBe(
		['a:a', 'b:b', 'c:a', 'd/a:a', 'd/b:b', 'd/c:a'].join('\n')
	);
});
