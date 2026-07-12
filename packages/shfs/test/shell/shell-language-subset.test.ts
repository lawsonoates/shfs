import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

const REQUIRES_ONE_VARIABLE_NAME = 'read requires exactly one variable name';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

test('read variables remain local to one shell API invocation', async () => {
	expect(await run('echo scoped | read local_only; echo $local_only')).toBe(
		'scoped'
	);
	expect(await run('echo $local_only')).toBe('');
});

test('the read subset requires exactly one variable name', async () => {
	await expect(run('read')).rejects.toThrow(REQUIRES_ONE_VARIABLE_NAME);
	await expect(run('read one two')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
});

test('the read subset rejects unsupported flags', async () => {
	await expect(run('read -a values')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
	await expect(run('read -n 3 value')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
	await expect(run('read -z value')).rejects.toThrow(
		REQUIRES_ONE_VARIABLE_NAME
	);
});

test('global variables persist across shell API invocations', async () => {
	await run('set -g smurf blue');
	expect(await run('echo $smurf')).toBe('blue');
});

test('local set variables remain local to one shell API invocation', async () => {
	expect(await run('set -l t3 bar; echo $t3')).toBe('bar');
	expect(await run('echo "[$t3]"')).toBe('[]');
});

test('global reassignment persists across shell API invocations', async () => {
	await run('set -g t5 a');
	await run('set -g t5 b');
	expect(await run('echo $t5')).toBe('b');
});

test('local scope shadows global scope within one shell API invocation', async () => {
	await run('set -g shade blue');
	expect(await run('set -l shade red; echo $shade')).toBe('red');
	expect(await run('echo $shade')).toBe('blue');
});

test('successful set preserves the incoming status', async () => {
	expect(await run('false; set -g keep x; echo $status')).toBe('1');
});

test('command assignments reject read-only variables', async () => {
	const result = await shell.$`status=42 echo $status`.nothrow();
	expect(result.exitCode).not.toBe(0);
	expect(result.text()).toBe('');
	expect(result.stderr.toString()).toContain(
		'status: cannot overwrite read-only variable'
	);
});

test('the set subset rejects universal and export flags', async () => {
	for (const command of [
		'set -x smurf blue',
		'set -U smurf blue',
		'set -u smurf blue',
	]) {
		const result = await shell.$`${command}`.nothrow();
		expect(result.exitCode).not.toBe(0);
	}
});
