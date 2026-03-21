// Translated/adapted from GNU findutils tests:
// - https://git.savannah.gnu.org/cgit/findutils.git/tree/tests/find/files0-from.sh
// Copyright (C) 2021-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { createFindHarness } from './harness';

const harness = createFindHarness();

function nulJoin(...parts: string[]): Uint8Array {
	const encoder = new TextEncoder();
	const segments = parts.map((p) => encoder.encode(p));
	const totalLen = segments.reduce((sum, s) => sum + s.length + 1, 0);
	const result = new Uint8Array(totalLen);
	let offset = 0;
	for (const seg of segments) {
		result.set(seg, offset);
		offset += seg.length;
		result[offset] = 0;
		offset += 1;
	}
	return result;
}

// -files0-from requires a file name argument.
test('files0-from: missing argument is an error', async () => {
	const result = await harness.runWithStderr('find -files0-from');
	expect(result.status).toBe(1);
	expect(result.output).toContain('missing argument');
});

// -files0-from must not be combined with starting points on the command line.
test('files0-from: extra operand on command line is rejected', async () => {
	await harness.setTextFile('/work/FILE', '');

	const result = await harness.runWithStderr(
		'find OFFENDING -files0-from /work/FILE'
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('extra operand');
	expect(result.output).toContain(
		'file operands cannot be combined with -files0-from'
	);
});

// Default starting point "." when neither -files0-from nor command line args.
test('files0-from: find with no args defaults to current directory', async () => {
	await harness.run('cd /work');

	const result = await harness.runWithStatus('find -maxdepth 0');
	expect(result.status).toBe(0);
	expect(result.output).toBe('.');
});

// -files0-from - with -ok is rejected (stdin conflict).
test('files0-from: -files0-from - with -ok is rejected', async () => {
	const result = await harness.runWithStderr(
		"echo '' | find -files0-from - -ok echo '{}' ';'"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('standard input');
	expect(result.output).toContain('ok');
});

// -files0-from - with -okdir is rejected (stdin conflict).
test('files0-from: -files0-from - with -okdir is rejected', async () => {
	const result = await harness.runWithStderr(
		"echo '' | find -files0-from - -okdir echo '{}' ';'"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('standard input');
	expect(result.output).toContain('ok');
});

// Non-existing file argument to -files0-from.
test('files0-from: non-existing file is an error', async () => {
	const result = await harness.runWithStderr(
		'find -files0-from ENOENT'
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('ENOENT');
	expect(result.output).toContain('No such');
});

// Empty input file: no output.
test('files0-from: empty input file produces no output', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	const result = await harness.runWithStatus(
		'find -files0-from /dev/null'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

// Empty stdin: no output.
test('files0-from: empty stdin produces no output', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	const result = await harness.runWithStatus(
		'find -files0-from - < /dev/null'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

// Regular case: 2 files listed in the input.
test('files0-from: two files listed in input are found', async () => {
	await harness.setTextFile('/work/a', '');
	await harness.setTextFile('/work/b', '');
	await harness.setFile('/work/input', nulJoin('a', 'b'));
	await harness.run('cd /work');

	const result = await harness.runWithStatus(
		'find -files0-from /work/input -print'
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	expect(lines).toEqual(['a', 'b']);
});

// File names that look like find tests or actions (e.g. -print, -mtime, -size)
// should be accepted when passed via -files0-from.
test('files0-from: file names resembling find predicates are accepted', async () => {
	await harness.setTextFile('/work/-print', '');
	await harness.setTextFile('/work/-mtime', '');
	await harness.setTextFile('/work/-size', '');
	await harness.setFile(
		'/work/input',
		nulJoin('-print', '-mtime', '-size')
	);
	await harness.run('cd /work');

	const result = await harness.runWithStatus(
		"find -files0-from /work/input -printf '%p\\n'"
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	expect(lines).toEqual(['-mtime', '-print', '-size']);
});

// Zero-length file name in input is an error, but other files are still processed.
test('files0-from: zero-length file name in input is an error', async () => {
	await harness.setTextFile('/work/a', '');
	await harness.setTextFile('/work/b', '');
	// Input: "a\0\0b\0" — the second entry is empty.
	await harness.setFile('/work/input', nulJoin('a', '', 'b'));

	const result = await harness.runWithStderr(
		'find -files0-from /work/input -print'
	);
	expect(result.status).toBe(1);
	// a and b should still be output.
	expect(result.output).toContain('a');
	expect(result.output).toContain('b');
	// Error about zero-length file name.
	expect(result.output).toContain('invalid zero-length file name');
});

// Non-existing file name in input is an error but others are still processed.
test('files0-from: non-existing file name in input reports error', async () => {
	await harness.setTextFile('/work/a', '');
	await harness.setTextFile('/work/b', '');
	await harness.setFile('/work/input', nulJoin('a', 'ENOENT', 'b'));
	await harness.run('cd /work');

	const result = await harness.runWithStderr(
		'find -files0-from /work/input -print'
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('ENOENT');
});

// Multiple -files0-from: only the last FILE is used.
test('files0-from: multiple -files0-from uses the last one', async () => {
	await harness.setTextFile('/work/m1', '');
	await harness.setTextFile('/work/m2', '');
	await harness.setTextFile('/work/m3', '');
	await harness.setFile('/work/f1', nulJoin('m1'));
	await harness.setFile('/work/f2', nulJoin('m2'));
	await harness.setFile('/work/f3', nulJoin('m3'));
	await harness.run('cd /work');

	const result = await harness.runWithStatus(
		'find -files0-from /work/f1 -files0-from /work/f2 -files0-from /work/f3'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('m3');
});

// Recursion is the default behavior for starting points from -files0-from.
test('files0-from: input starting points are recursed by default', async () => {
	await harness.ensureDir('/work/d1/d2/d3');
	await harness.setTextFile('/work/d1/d2/d3/file', '');
	await harness.setFile('/work/input', nulJoin('d1'));
	await harness.run('cd /work');

	const result = await harness.runWithStatus(
		'find -files0-from /work/input'
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	expect(lines).toEqual(['d1', 'd1/d2', 'd1/d2/d3', 'd1/d2/d3/file']);
});

// -maxdepth 0 with -files0-from prevents recursion.
test('files0-from: -maxdepth 0 prevents recursion into starting points', async () => {
	await harness.ensureDir('/work/d1/d2/d3');
	await harness.setTextFile('/work/d1/d2/d3/file', '');
	// List all entries that find would normally discover.
	await harness.setFile(
		'/work/input',
		nulJoin('d1', 'd1/d2', 'd1/d2/d3', 'd1/d2/d3/file')
	);
	await harness.run('cd /work');

	const result = await harness.runWithStatus(
		'find -files0-from /work/input -maxdepth 0'
	);
	expect(result.status).toBe(0);
	const lines = result.output.split('\n').sort();
	// -maxdepth 0 means no recursion: each starting point is listed, but not entered.
	expect(lines).toEqual(['d1', 'd1/d2', 'd1/d2/d3', 'd1/d2/d3/file']);
});

// Closing paren as first predicate with -files0-from is an error.
test('files0-from: closing paren as first predicate is an error', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	const result = await harness.runWithStderr(
		"find -files0-from - ')' -print < /dev/null"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('expected expression before closing parentheses');
});

test('files0-from: closing paren without -print is also an error', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	const result = await harness.runWithStderr(
		"find -files0-from - ')' < /dev/null"
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('expected expression before closing parentheses');
});
