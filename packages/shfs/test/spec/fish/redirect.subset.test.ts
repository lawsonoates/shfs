// Translated/adapted from fish-shell tests/checks/redirect.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/redirect.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;
const MISSING_PATH_MESSAGE = 'No such file or directory';

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runWithStatus(
	command: string
): Promise<{ output: string; stderr: string; status: number }> {
	const result = await shell.$`${command}`.nothrow();
	return {
		output: result.text(),
		stderr: result.stderr.toString(),
		status: result.exitCode,
	};
}

async function prepareMixedStreamFixture(): Promise<void> {
	await run('mkdir -p /workspace /tmp');
	await run('touch /workspace/a.txt');
}

// redirect.fish lines 8-9: outnerr 0 &| count
// Adapted: use find with one valid path (stdout) and one missing path (stderr),
// then pipe both streams via &|.
test('fish redirect: redirect.fish - &| pipes both stdout and stderr', async () => {
	await prepareMixedStreamFixture();

	const result = await runWithStatus(
		'find /workspace /missing -maxdepth 0 &| grep -F "No such file or directory"'
	);
	expect(result.status).toBe(0);
	expect(result.output).toContain(MISSING_PATH_MESSAGE);
	expect(result.stderr).toBe('');
});

// redirect.fish lines 12-14: outnerr appendfd 2>>&1
// Adapted: verify fd-dup append form merges stderr into stdout.
test('fish redirect: redirect.fish - 2>>&1 merges stderr into stdout', async () => {
	await prepareMixedStreamFixture();

	const result = await runWithStatus(
		'find /workspace /missing -maxdepth 0 2>>&1'
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('/workspace');
	expect(result.output).toContain(MISSING_PATH_MESSAGE);
	expect(result.stderr).toBe('');
});

// redirect.fish lines 17-20: outnerr overwrite &>$tmpdir/file.txt
test('fish redirect: redirect.fish - &> redirects both stdout and stderr to a file', async () => {
	await prepareMixedStreamFixture();

	const result = await runWithStatus(
		'find /workspace /missing -maxdepth 0 &> /tmp/both.txt'
	);
	expect(result.status).toBe(1);
	expect(result.output).toBe('');
	expect(result.stderr).toBe('');

	const redirected = await run('cat /tmp/both.txt');
	expect(redirected).toContain('/workspace');
	expect(redirected).toContain(MISSING_PATH_MESSAGE);
});

// redirect.fish lines 22-27: outnerr append &>>$tmpdir/file.txt
test('fish redirect: redirect.fish - &>> appends both stdout and stderr to an existing file', async () => {
	await prepareMixedStreamFixture();

	await runWithStatus(
		'find /workspace /missing-one -maxdepth 0 &> /tmp/append.txt'
	);
	await runWithStatus(
		'find /workspace /missing-two -maxdepth 0 &>> /tmp/append.txt'
	);

	const redirected = await run('cat /tmp/append.txt');
	expect(redirected).toContain('/workspace');
	expect(redirected).toContain('/missing-one');
	expect(redirected).toContain('/missing-two');
});

// Mixed same-file > and 2>> should truncate before merging channels.
test('fish redirect: redirect.fish - mixed same-file redirections preserve overwrite semantics', async () => {
	await run('mkdir -p /tmp');
	await run('echo stale > /tmp/mixed.txt');

	await run('echo fresh > /tmp/mixed.txt 2>> /tmp/mixed.txt');

	expect(await run('cat /tmp/mixed.txt')).toBe('fresh');
});

// redirect.fish lines 29-30: echo noclobber &>>?$tmpdir/file.txt
test('fish redirect: redirect.fish - noclobber form &>>? refuses to overwrite an existing file', async () => {
	await run('mkdir -p /tmp');
	await run('echo seed > /tmp/noclobber.txt');

	const result = await runWithStatus(
		'echo noclobber &>>? /tmp/noclobber.txt'
	);
	expect(result.status).toBe(1);
	expect(await run('cat /tmp/noclobber.txt')).toBe('seed');
});

// redirect.fish lines 32-35: eval "echo foo |& false"
// Adapted: no eval wrapper; assert fish's invalid |& syntax is rejected.
test('fish redirect: redirect.fish - |& is rejected in favor of &|', async () => {
	const result = await runWithStatus('echo foo |& false');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('|&');
});

// redirect.fish lines 37-44: redirection with empty data still creates file.
test('fish redirect: redirect.fish - > creates an empty target file for empty output', async () => {
	await run('mkdir -p /tmp');
	await run('echo "" > /tmp/empty-stdout.txt');
	expect(await run('cat /tmp/empty-stdout.txt')).toBe('');
});

// redirect.fish lines 46-49: echo -n 2>$tmpdir/file.txt
test('fish redirect: redirect.fish - 2> creates the target file even when stderr is empty', async () => {
	await run('mkdir -p /tmp');
	await run('echo "" 2> /tmp/empty-stderr.txt');
	expect(await run('cat /tmp/empty-stderr.txt')).toBe('');
});

// redirect.fish lines 66-80: end 2>&1 | ...
test('fish redirect: redirect.fish - 2>&1 merges stderr into stdout for downstream pipelines', async () => {
	await prepareMixedStreamFixture();

	const result = await runWithStatus(
		'find /workspace /missing -maxdepth 0 2>&1 | grep -F "No such file or directory"'
	);
	expect(result.status).toBe(0);
	expect(result.output).toContain(MISSING_PATH_MESSAGE);
	expect(result.stderr).toBe('');
});

// redirect.fish lines 82-84: trailing ^ does not trigger redirection.
test('fish redirect: redirect.fish - trailing caret is literal text, not a redirection', async () => {
	expect(await run('echo caret_no_redirect 12345^')).toBe(
		'caret_no_redirect 12345^'
	);
});

// redirect.fish lines 86-95: pipe stderr (2>|) without changing stdout behavior.
test('fish redirect: redirect.fish - 2>| pipes stderr while stdout remains on stdout', async () => {
	await prepareMixedStreamFixture();

	const result = await runWithStatus(
		'find /workspace /missing -maxdepth 0 2>| cat > /tmp/stderr-piped.txt'
	);
	expect(result.status).toBe(1);
	expect(result.output).toContain('/workspace');
	expect(result.stderr).toBe('');
	expect(await run('cat /tmp/stderr-piped.txt')).toContain(
		MISSING_PATH_MESSAGE
	);
});

// redirect.fish lines 97-106: closed stdin with <&-.
// Adapted: include read case, which should surface a closed-stdin failure.
test('fish redirect: redirect.fish - <&- closes stdin for read', async () => {
	const result = await runWithStatus('read abc <&-');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('stdin is closed');
});

// redirect.fish lines 108-109: echo derp >&- outputs nothing.
test('fish redirect: redirect.fish - >&- closes stdout for the command', async () => {
	const result = await runWithStatus('echo derp >&-');
	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

// redirect.fish lines 111-115: echo hooray1 >&1; echo hooray2 >&2.
test('fish redirect: redirect.fish - >&1 writes to stdout and >&2 writes to stderr', async () => {
	const stdoutResult = await runWithStatus('echo hooray1 >&1');
	expect(stdoutResult.status).toBe(0);
	expect(stdoutResult.output).toBe('hooray1');
	expect(stdoutResult.stderr).toBe('');

	const stderrResult = await runWithStatus('echo hooray2 >&2');
	expect(stderrResult.status).toBe(0);
	expect(stderrResult.output).toBe('');
	expect(stderrResult.stderr).toContain('hooray2');
});

// redirect.fish lines 117-140 exercise fd duplication in pipeline contexts via <&N.
// Adapted: a simpler direct duplication case using <&3.
test('fish redirect: redirect.fish - <&3 duplicates fd 3 onto stdin', async () => {
	await run('mkdir -p /tmp');
	await run('echo from-fd3 > /tmp/fd3-input.txt');

	const result = await runWithStatus('cat <&3 3</tmp/fd3-input.txt 3<&-');
	expect(result.status).toBe(0);
	expect(result.output).toBe('from-fd3');
	expect(result.stderr).toBe('');
});

// redirect.fish lines 142-144: error redirecting into a non-directory path.
test('fish redirect: redirect.fish - redirecting into a non-directory path reports an error', async () => {
	await run('mkdir -p /tmp');
	await run('echo leaf > /tmp/not-a-dir');
	const result = await runWithStatus('echo foo >/tmp/not-a-dir/file');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('/tmp/not-a-dir');
});

// redirect.fish lines 146-149: echo foo <?nonexistent (try-input).
test('fish redirect: redirect.fish - <? with a missing file allows command to continue', async () => {
	const result = await runWithStatus('echo foo <?nonexistent');
	expect(result.status).toBe(0);
	expect(result.output).toBe('foo');
});

// redirect.fish lines 151-155: read -l foo <?nonexistent.
// Adapted: shfs read subset does not support -l, so use plain read.
test('fish redirect: redirect.fish - read with <? on a missing file fails without setting a value', async () => {
	const result = await runWithStatus('read foo <?nonexistent');
	expect(result.status).toBe(1);
	expect(await run('echo $foo')).toBe('');
});

// redirect.fish lines 157-161: true <&?fail invalid fd syntax.
test('fish redirect: redirect.fish - <&?fail is rejected as an invalid redirection target', async () => {
	const result = await runWithStatus('echo ok <&?fail');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('?fail');
});

// redirect.fish lines 163-166: true <?&fail parse error.
test('fish redirect: redirect.fish - <?&fail is rejected', async () => {
	const result = await runWithStatus('echo ok <?&fail');
	expect(result.status).toBe(1);
	expect(result.stderr).toContain('&');
});
