// Translated/adapted from GNU coreutils tests:
// - tests/cp/r-vs-symlink.sh
// - tests/cp/symlink-slash.sh
// Copyright (C) 2000-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '@test/harness';

const harness = Harness.create();

async function collectPaths(paths: AsyncIterable<string>): Promise<string[]> {
	const collected: string[] = [];
	for await (const path of paths) {
		collected.push(path);
	}
	return collected;
}

test('gnu cp: r-vs-symlink.sh - cp -r preserves symlink operands', async () => {
	await harness.setTextFile('/work/foo', 'abc\n');
	await harness.fs.symlink('foo', '/work/slink');
	await harness.fs.symlink('no-such-file', '/work/no-file');
	await harness.run('cd /work');

	const danglingResult = await harness.runWithStatus('cp -r no-file junk');
	expect(danglingResult.status).toBe(0);
	expect(await harness.fs.readLink('/work/junk')).toBe('no-such-file');

	const linkedResult = await harness.runWithStatus('cp -r slink bar');
	expect(linkedResult.status).toBe(0);
	expect(await harness.fs.readLink('/work/bar')).toBe('foo');
});

test('gnu cp: symlink-slash.sh - a trailing slash dereferences a recursive symlink operand', async () => {
	await harness.ensureDir('/work/dir');
	await harness.fs.symlink('dir', '/work/symlink');
	await harness.run('cd /work');

	const result = await harness.runWithStatus('cp -r symlink/ s');

	expect(result.status).toBe(0);
	await expect(harness.fs.readLink('/work/s')).rejects.toThrow(
		'Not a symlink: /work/s'
	);
	expect((await harness.fs.stat('/work/s')).type).toBe('Directory');
	expect(await collectPaths(harness.fs.readDirectory('/work/s'))).toEqual([]);
});
