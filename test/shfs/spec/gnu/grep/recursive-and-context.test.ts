// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/include-exclude
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/r-dot
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/max-count-vs-context
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/word-multi-file
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/skip-device
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/word-delim-multibyte
// Copyright (C) 2001, 2006, 2009-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '#harness';

const harness = Harness.create();

function sortedLines(text: string): string {
	if (text === '') {
		return '';
	}
	return text.split('\n').sort().join('\n');
}

test('gnu grep: include-exclude - recursive include/exclude filtering mirrors GNU behavior', async () => {
	await harness.run('mkdir -p /work/x/dir');
	await harness.setTextFile('/work/x/a', 'aaa\n');
	await harness.setTextFile('/work/x/b', 'bbb\n');
	await harness.setTextFile('/work/x/dir/d', 'ddd\n');
	await harness.run('cd /work');

	const notA = await harness.runWithStatus("grep -r --exclude='a*' . x");
	expect(notA.status).toBe(0);
	expect(sortedLines(notA.output)).toBe('x/b:bbb\nx/dir/d:ddd');

	const notAB = await harness.runWithStatus("grep -r --exclude='[ab]' . x");
	expect(notAB.status).toBe(0);
	expect(sortedLines(notAB.output)).toBe('x/dir/d:ddd');

	const notD = await harness.runWithStatus("grep -r --exclude='*d' . x");
	expect(notD.status).toBe(0);
	expect(sortedLines(notD.output)).toBe('x/a:aaa\nx/b:bbb');

	const notDir = await harness.runWithStatus('grep -r --exclude-dir=dir . x');
	expect(notDir.status).toBe(0);
	expect(sortedLines(notDir.output)).toBe('x/a:aaa\nx/b:bbb');

	const includeA = await harness.runWithStatus('grep -r --include=a . x');
	expect(includeA.status).toBe(0);
	expect(includeA.output).toBe('x/a:aaa');

	const includeGlobA = await harness.runWithStatus(
		"grep -r --include='a*' . x"
	);
	expect(includeGlobA.status).toBe(0);
	expect(includeGlobA.output).toBe('x/a:aaa');

	const includeNonRecursive = await harness.runWithStatus(
		"grep --directories=skip --include=a --exclude-dir=dir '^aaa$' x/*"
	);
	expect(includeNonRecursive.status).toBe(0);
	expect(includeNonRecursive.output).toBe('x/a:aaa');

	await harness.run('cd /work/x');
	const excludeDotDir = await harness.runWithStatus(
		"grep -r --exclude-dir=. '^aaa$'"
	);
	expect(excludeDotDir.status).toBe(0);
	expect(excludeDotDir.output).toBe('a:aaa');

	await harness.run('cd /work');
	const excludeDash = await harness.runWithStatus(
		"grep --exclude=- '^aaa$' - < /work/x/a"
	);
	expect(excludeDash.status).toBe(0);
	expect(excludeDash.output).toBe('aaa');
});

test('gnu grep: r-dot - -r defaults to current directory when no file operand is provided', async () => {
	await harness.run('mkdir -p /work/dir');
	await harness.setTextFile('/work/dir/a', 'aaa\n');
	await harness.setTextFile('/work/dir/b', 'bbb\n');

	await harness.run('cd /work/dir');
	const plain = await harness.runWithStatus('grep -r aaa');
	expect(plain.status).toBe(0);
	expect(plain.output).toBe('a:aaa');

	const withStdin = await harness.runWithStatus('grep -r aaa < a');
	expect(withStdin.status).toBe(0);
	expect(withStdin.output).toBe('a:aaa');
});

test('gnu grep: max-count-vs-context - -m1 with -A5 stops after first match context window', async () => {
	await harness.setTextFile(
		'/tmp/in.txt',
		[
			'needle',
			'1st line of context',
			'2nd line of context',
			'3rd line of context',
			'another needle',
			'5th line of context relative to first match',
			'6th line...',
			'',
		].join('\n')
	);

	const result = await harness.runWithStatus(
		'grep -m1 -A5 needle /tmp/in.txt'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe(
		[
			'needle',
			'1st line of context',
			'2nd line of context',
			'3rd line of context',
		].join('\n')
	);
});

test('gnu grep: word-multi-file - -w over recursive and explicit multi-file inputs', async () => {
	await harness.run('mkdir -p /work/a');
	await harness.setTextFile('/work/a/1', 'aa bb cc\n');
	await harness.setTextFile('/work/a/2', 'bb dd ff\n');
	await harness.setTextFile('/work/a/3', 'ff gg hh\n');
	await harness.setTextFile('/work/a/4', 'bb xx zz\n');

	await harness.run('cd /work');
	const recursive = await harness.runWithStatus('grep -rw bb a');
	expect(recursive.status).toBe(0);
	expect(sortedLines(recursive.output)).toBe(
		['a/1:aa bb cc', 'a/2:bb dd ff', 'a/4:bb xx zz'].join('\n')
	);

	await harness.run('cd /work/a');
	const explicit = await harness.runWithStatus('grep -w bb [1-4]');
	expect(explicit.status).toBe(0);
	expect(explicit.output).toBe(
		['1:aa bb cc', '2:bb dd ff', '4:bb xx zz'].join('\n')
	);
});

test('gnu grep: skip-device - --devices=skip must not ignore stdin', async () => {
	const withDash = await harness.runWithStatus(
		'echo foo | grep -D skip foo -'
	);
	expect(withDash.status).toBe(0);
	expect(withDash.output).toBe('foo');

	const implicitStdin = await harness.runWithStatus(
		'echo foo | grep --devices=skip foo'
	);
	expect(implicitStdin.status).toBe(0);
	expect(implicitStdin.output).toBe('foo');
});

test('gnu grep: word-delim-multibyte - \\< recognizes multibyte word starts', async () => {
	const eAcute = 'é';
	await harness.setTextFile('/tmp/in.txt', `${eAcute}\n`);

	const result = await harness.runWithStatus(
		`grep ${Harness.quote(`\\<${eAcute}`)} /tmp/in.txt`
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe(eAcute);
});
