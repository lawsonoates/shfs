// Translated/adapted from GNU coreutils tests/sort/sort.pl.
// Copyright (C) 2008-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';
import { setTextFile } from './utils';

const INPUT_PATH = '/sort-stdin';

let fs!: MemoryFS;
let $!: Shell['$'];

beforeEach(() => {
	fs = new MemoryFS();
	$ = new Shell(fs).$;
});

test('gnu sort: sort.pl 03d - -k rejects field zero', async () => {
	const result = await $`sort -k0`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain(
		"invalid field specification '0'"
	);
});

test('gnu sort: sort.pl 03e - -k rejects character offset zero', async () => {
	const result = await $`sort -k1.0`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain('character offset is zero');
	expect(result.stderr.toString()).toContain(
		"invalid field specification '1.0'"
	);
});

test('gnu sort: sort.pl 03f - -k reports invalid end-key field', async () => {
	const result = await $`sort -k1.1,-k0`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain("invalid number after ','");
	expect(result.stderr.toString()).toContain(
		"invalid count at start of '-k0'"
	);
});

test('gnu sort: sort.pl 08a - -k reports missing character offset after dot', async () => {
	const result = await $`sort -k 2.,3`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain("invalid number after '.'");
	expect(result.stderr.toString()).toContain(
		"invalid count at start of ',3'"
	);
});

test('gnu sort: sort.pl 08b - -k reports missing key position after comma', async () => {
	const result = await $`sort -k 2,`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain("invalid number after ','");
	expect(result.stderr.toString()).toContain("invalid count at start of ''");
});

test('gnu sort: sort.pl no-file1 - missing file operands are read errors', async () => {
	const result = await $`sort no-file`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain('cannot read: no-file');
	expect(result.stderr.toString()).toContain('No such file or directory');
});

test('gnu sort: sort.pl incompat6 - -c and -C are incompatible', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nB\n');

	const result = await $`sort -cC < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain(
		"options '-cC' are incompatible"
	);
});
