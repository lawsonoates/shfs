// Translated/adapted from fish-shell tests/checks/directory-redirect.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/directory-redirect.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Reductions: upstream redirects a begin/end block and inspects `status -b`;
// block redirection targets and the `status` builtin are out of scope. The
// preserved contract is that redirecting output to an existing directory is
// an error with status 1.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

// directory-redirect.fish:2-9: a redirect targeting a directory fails and
// $status is 1.
test('fish directory-redirect: directory-redirect.fish - redirect to a directory fails with status 1', async () => {
	const result =
		await shell.$`mkdir /d; echo hi > /d; echo $status`.nothrow();
	expect(result.text().trim()).toBe('1');
	expect(result.stderr.toString()).toContain('Is a directory');
});
