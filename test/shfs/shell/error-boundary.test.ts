import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { Shell } from '#shfs/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

// Runs a command and returns the raw ShellOutput without throwing on non-zero exit.
async function run(command: string) {
	return await shell.$`${command}`.nothrow();
}

test('expansion failure in a statement does not abort the rest of the script', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; echo AFTER');

	expect(result.stdout.toString()).toBe('AFTER');
	expect(result.exitCode).toBe(0);
	expect(result.stderr.toString()).toContain(
		'no matches found: /w/none-*.txt'
	);
});

test('and-chain short-circuits after a failed command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; and echo AFTER');

	expect(result.stdout.toString()).toBe('');
	expect(result.exitCode).toBe(1);
});

test('or-chain recovers after a failed command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; or echo RECOVERED');

	expect(result.stdout.toString()).toBe('RECOVERED');
	expect(result.exitCode).toBe(0);
});

test("$status reflects a command's expansion failure", async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; echo $status');

	expect(result.stdout.toString()).toBe('1');
});

test('2> redirects an expansion-failure diagnostic to a file, not shell stderr', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt 2> /w/err.txt');

	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);

	const errFile = await run('cat /w/err.txt');
	expect(errFile.stdout.toString()).toContain(
		'no matches found: /w/none-*.txt'
	);
});

test('2> redirects command read errors to a file, not shell stderr', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt 2> /w/stream-err.txt');

	expect(result.stdout.toString()).toBe('');
	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);

	const errFile = await run('cat /w/stream-err.txt');
	expect(errFile.stdout.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
});

test('2>| pipes stream collection failures to the next command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('ls /w/missing 2>| wc -l');

	expect(result.stdout.toString()).toBe('1');
	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);
});

test('reading a missing file never throws from .nothrow()', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt');

	expect(result.exitCode).not.toBe(0);
	expect(result.stderr.toString()).not.toBe('');
});

test('a missing-file read reports an error but the script continues', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt; echo AFTER');

	expect(result.stdout.toString()).toBe('AFTER');
});

test('cat reports a missing file GNU-style and exits 1', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt');

	expect(result.stdout.toString()).toBe('');
	expect(result.stderr.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
	expect(result.exitCode).toBe(1);
});

test('cat keeps output from readable operands around a missing one', async () => {
	await run('mkdir -p /w');
	await run('cd /w');
	await run('echo hello > /w/a.txt');
	await run('echo world > /w/b.txt');

	const result = await run('cat /w/a.txt /w/missing.txt /w/b.txt');

	expect(result.stdout.toString()).toBe('hello\nworld');
	expect(result.stderr.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
	expect(result.exitCode).toBe(1);
});
