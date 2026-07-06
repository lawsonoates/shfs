// Translated/adapted from GNU findutils DejaGNU tests:
// - find/testsuite/find.gnu/follow-arg-parent-symlink.exp
// - find/testsuite/find.gnu/xtype-symlink.exp
// Copyright (C) 2005-2025 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '@test/harness';

const harness = Harness.create();

test('gnu find: follow-arg-parent-symlink.exp - path components traverse through symlinked parents', async () => {
	await harness.ensureDir('/tmp/dir1/dir2');
	await harness.setTextFile('/tmp/dir1/dir2/foo', '');
	await harness.fs.symlink('dir1', '/tmp/link1');
	await harness.run('cd /');

	const result = await harness.runWithStatus(
		'find tmp/link1/dir2 -type f -print'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/link1/dir2/foo');
});

test('gnu find: xtype-symlink.exp - -xtype f matches a symlink whose target is a regular file', async () => {
	await harness.ensureDir('/tmp');
	await harness.setTextFile('/tmp/file', '');
	await harness.fs.symlink('file', '/tmp/LINK');
	await harness.run('cd /');

	const result = await harness.runWithStatus('find tmp/LINK -xtype f');
	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/LINK');
});
