// Translated/adapted from fish-shell tests/checks/cd.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/cd.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runNothrow(command: string): Promise<string> {
	return await shell.$`${command}`.nothrow().text();
}

test('cd/pwd: supports absolute and relative navigation with . and ..', async () => {
	await run('mkdir -p /workspace/app/src');
	await run('cd /workspace');
	expect(await run('pwd')).toBe('/workspace');

	await run('cd app/src');
	expect(await run('pwd')).toBe('/workspace/app/src');

	await run('cd ..');
	expect(await run('pwd')).toBe('/workspace/app');

	await run('cd ./src');
	expect(await run('pwd')).toBe('/workspace/app/src');

	await run('cd ../../..');
	expect(await run('pwd')).toBe('/');
});

test('cd/pwd: navigating above root stays at root', async () => {
	await run('cd /');
	await run('cd ..');
	expect(await run('pwd')).toBe('/');
});

test('cd subset: supports -- for directories that begin with a hyphen', async () => {
	await run('mkdir -p /workspace');
	await run('mkdir /workspace/-testdir');
	await run('cd /workspace');
	await run('cd -- -testdir');

	expect(await run('pwd')).toBe('/workspace/-testdir');
	expect(await run('echo $status')).toBe('0');
});

test('cd subset: failed cd does not change the current working directory', async () => {
	await run('mkdir -p /workspace/current');
	await run('cd /workspace/current');

	await expect(run('cd /workspace/missing')).rejects.toThrow(
		'cd: directory does not exist: /workspace/missing'
	);
	expect(await run('pwd')).toBe('/workspace/current');
});

test('cd subset: pwd remains absolute after relative cd navigation', async () => {
	await run('mkdir -p /workspace/alpha/beta');
	await run('cd /workspace/alpha');
	await run('cd beta');

	const current = await run('pwd');
	expect(current.startsWith('/')).toBe(true);
	expect(current).toBe('/workspace/alpha/beta');
});

test('set: global variables persist, local variables are scoped to one script run', async () => {
	await run('set -g PROJECT_ROOT /workspace');
	expect(await run('echo $PROJECT_ROOT')).toBe('/workspace');

	expect(await run('set -l LOCAL_ONLY scoped; echo $LOCAL_ONLY')).toBe(
		'scoped'
	);
	expect(await run('echo $LOCAL_ONLY')).toBe('');
});

test('command substitution: executes and can be used as cd target', async () => {
	await run('mkdir -p /workspace/subdir');
	expect(await run('cd /workspace; cd (echo subdir); pwd')).toBe(
		'/workspace/subdir'
	);
});

test('command substitution: nested substitutions resolve inner output', async () => {
	expect(await run('echo (echo (echo nested))')).toBe('nested');
});

test('statement chaining: supports newline-separated scripts', async () => {
	expect(
		await run('mkdir -p /chain/newline\ncd /chain\ncd newline\npwd')
	).toBe('/chain/newline');
});

test('statement chaining: supports semicolon-separated scripts', async () => {
	expect(
		await run('mkdir -p /chain/semicolon; cd /chain; cd semicolon; pwd')
	).toBe('/chain/semicolon');
});

test('status and boolean chaining: and/or use prior command status', async () => {
	expect(await run('test 1 = 1; and echo pass; or echo fail')).toBe('pass');
	expect(await run('test 1 = 2; and echo pass; or echo fail')).toBe('fail');
});

test('$status: reflects success and failure as 0/1', async () => {
	await run('test 1 = 1');
	expect(await run('echo $status')).toBe('0');

	await runNothrow('test 1 = 2');
	expect(await run('echo $status')).toBe('1');
});

test('read: can capture pipeline input into a variable', async () => {
	expect(await run('echo /workspace | read target; echo $target')).toBe(
		'/workspace'
	);

	await run('mkdir -p /workspace/from-read');
	expect(
		await run('echo /workspace/from-read | read target; cd $target; pwd')
	).toBe('/workspace/from-read');
});

test('string: can transform paths used by cd and participate in status chains', async () => {
	await run('mkdir -p /workspace/string-target');
	expect(
		await run(
			'cd (string replace TARGET string-target /workspace/TARGET); pwd'
		)
	).toBe('/workspace/string-target');

	expect(
		await run(
			'string match -q "/workspace/*" /workspace/string-target; and echo yes; or echo no'
		)
	).toBe('yes');
});

test('cd errors: missing directory has stable deterministic message', async () => {
	await expect(run('cd /missing')).rejects.toThrow(
		'cd: directory does not exist: /missing'
	);
});

test('cd errors: file target has stable deterministic message', async () => {
	await run('touch /not-a-directory');
	await expect(run('cd /not-a-directory')).rejects.toThrow(
		'cd: not a directory: /not-a-directory'
	);
});

test('cd errors: empty path fails and sets status to 1', async () => {
	await expect(run('cd ""')).rejects.toThrow('cd: empty path');
	expect(await run('echo $status')).toBe('1');
});
