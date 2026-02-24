import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '../fs/memory';
import { Shell } from '../shell/shell';

let shell!: Shell;
const UNSUPPORTED_GLOB_REGEX = /glob|wildcard|unsupported/i;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

test('glob subset: wildcard expansion is out of scope for ls', async () => {
	await run('mkdir -p /workspace');
	await run('touch /workspace/a.txt /workspace/b.txt');
	await run('cd /workspace');

	await expect(run('ls *.txt')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
	await expect(run('ls ?.txt')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
	await expect(run('ls [ab].txt')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
	await expect(run('ls **/*.txt')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
});

test('glob subset: wildcard expansion is out of scope for other path-taking commands', async () => {
	await run('mkdir -p /workspace/one /workspace/two');
	await run('cd /workspace');

	await expect(run('cd *')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
	await expect(run('rm -rf t*')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
	await expect(run('touch f?.txt')).rejects.toThrow(UNSUPPORTED_GLOB_REGEX);
});

test('glob subset: quoted wildcard characters are literal text, not patterns', async () => {
	expect(await run("echo '*' '?' '[ab]' '**'")).toBe('* ? [ab] **');
});
