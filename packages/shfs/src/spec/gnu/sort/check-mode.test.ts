// Translated/adapted from GNU coreutils tests/sort/sort.pl.
// Copyright (C) 2008-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../../fs/memory';
import { Shell } from '../../../shell/shell';
import { setTextFile } from './utils';

const INPUT_PATH = '/sort-stdin';

let fs!: MemoryFS;
let $!: Shell['$'];

beforeEach(() => {
	fs = new MemoryFS();
	$ = new Shell(fs).$;
});

test('gnu sort: sort.pl 02a - -c accepts sorted input without stdout', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nB\nC\n');

	const result = await $`sort -c < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});

test('gnu sort: sort.pl 02b - -c reports disorder for unsorted input', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nC\nB\n');

	const result = await $`sort -c < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain('disorder: B');
});

test('gnu sort: sort.pl 02c - -c accepts input sorted by a bounded key', async () => {
	await setTextFile(fs, INPUT_PATH, 'a\na b\n');

	const result = await $`sort -c -k1,1 < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});

test('gnu sort: sort.pl 02d - -C accepts sorted input without stdout or diagnostics', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nB\nC\n');

	const result = await $`sort -C < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});

test('gnu sort: sort.pl 02e - -C rejects unsorted input silently', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nC\nB\n');

	const result = await $`sort -C < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});

test('gnu sort: sort.pl 02n - -cu accepts sorted input with distinct keys', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nB\n');

	const result = await $`sort -cu < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});

test('gnu sort: sort.pl 02o - -cu rejects adjacent duplicate keys', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nB\nB\n');

	const result = await $`sort -cu < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain('disorder: B');
});

test('gnu sort: sort.pl 02p - -cu reports the first unsorted line before later duplicates', async () => {
	await setTextFile(fs, INPUT_PATH, 'B\nA\nB\n');

	const result = await $`sort -cu < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain('disorder: A');
});

test('gnu sort: sort.pl 02m - -cu treats duplicate keys as disorder', async () => {
	await setTextFile(fs, INPUT_PATH, 'A\nA\n');

	const result = await $`sort -cu < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain('disorder: A');
});

test('gnu sort: sort.pl 04a - -nc accepts numerically sorted input', async () => {
	await setTextFile(fs, INPUT_PATH, '2\n11\n');

	const result = await $`sort -nc < ${INPUT_PATH}`.nothrow();

	expect(result.exitCode).toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toBe('');
});
