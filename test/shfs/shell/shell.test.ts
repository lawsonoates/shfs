import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { ShellError, ShellOutput } from '#shfs/output-channels';
import { Shell } from '#shfs/shell/shell';

test('shell pwd defaults to root cwd', async () => {
	const shell = new Shell(new MemoryFS());

	expect(await shell.$`pwd`.text()).toBe('/');
});

test('shell cwd state is configurable and affects pwd', async () => {
	const shell = new Shell(new MemoryFS(), { cwd: '/workspace/project' });

	expect(await shell.$`pwd`.text()).toBe('/workspace/project');

	shell.cwd('/tmp/');

	expect(await shell.$`pwd`.text()).toBe('/tmp');
});

test('shell command evaluation uses latest cwd state', async () => {
	const shell = new Shell(new MemoryFS());
	const command = shell.$`pwd`;

	shell.cwd('/var/log');

	expect(await command.text()).toBe('/var/log');
});

test('shell cd command persists cwd state across commands', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/project', true);
	const shell = new Shell(fs);

	expect(await shell.$`cd /workspace`.text()).toBe('');
	expect(await shell.$`pwd`.text()).toBe('/workspace');

	expect(await shell.$`cd project`.text()).toBe('');
	expect(await shell.$`pwd`.text()).toBe('/workspace/project');
});

test('command builder supports cwd override chaining', async () => {
	const shell = new Shell(new MemoryFS(), { cwd: '/workspace' });

	expect(await shell.$`pwd`.cwd('').text()).toBe('/');
	expect(await shell.$`pwd`.cwd('/tmp').text()).toBe('/tmp');
});

test('cwd override does not mutate shell state when command does not change cwd', async () => {
	const shell = new Shell(new MemoryFS(), { cwd: '/workspace' });

	expect(await shell.$`pwd`.cwd('/tmp').text()).toBe('/tmp');
	expect(await shell.$`pwd`.text()).toBe('/workspace');
});

test('cwd override can be used as base for cd and persists resulting cwd', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/tmp/project', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	expect(await shell.$`cd project`.cwd('/tmp').text()).toBe('');
	expect(await shell.$`pwd`.text()).toBe('/tmp/project');
});

test('shell executes newline-separated statements in one invocation', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/project', true);
	const shell = new Shell(fs);

	const output = await shell.$`cd /workspace
cd project
pwd`.text();

	expect(output).toBe('/workspace/project');
});

test('shell executes semicolon-separated statements in one invocation', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/project', true);
	const shell = new Shell(fs);

	const output = await shell.$`cd /workspace; cd project; pwd`.text();

	expect(output).toBe('/workspace/project');
});

test('shell formats syntax, usage, and expansion failures through one diagnostic style', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	await expect(shell.$`echo )`.text()).rejects.toBeInstanceOf(ShellError);
	await expect(shell.$`grep -e`.text()).rejects.toBeInstanceOf(ShellError);
	await expect(shell.$`echo hello > *`.text()).rejects.toBeInstanceOf(
		ShellError
	);

	const syntax = await shell.$`echo )`.nothrow();
	const usage = await shell.$`grep -e`.nothrow();
	const expansion = await shell.$`echo hello > *`.nothrow();

	expect(syntax.stderr.toString()).toContain('error[parse:unexpected-token]');
	expect(usage.stderr.toString()).toContain('error[compile:missing-value]');
	expect(expansion.stderr.toString()).toContain(
		'error[expansion:invalid-path-count]'
	);
});

test('shell command await resolves to Bun-like shell output', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	const success = await shell.$`pwd`;
	expect(success).toBeInstanceOf(ShellOutput);
	expect(success.stdout.toString()).toBe('/workspace');
	expect(success.stderr.toString()).toBe('');
	expect(success.exitCode).toBe(0);

	const failure = await shell.$`echo hello > *`.nothrow();
	expect(failure.stdout.toString()).toBe('');
	expect(failure.stderr.toString()).toContain(
		'error[expansion:invalid-path-count]'
	);
	expect(failure.exitCode).toBe(1);
});

test('shell throws Bun-like ShellError by default for non-zero exits', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	try {
		await shell.$`echo hello > *`;
		throw new Error('expected command to throw');
	} catch (error) {
		expect(error).toBeInstanceOf(ShellError);
		if (!(error instanceof ShellError)) {
			throw error;
		}
		expect(error.exitCode).toBe(1);
		expect(error.stderr.toString()).toContain(
			'error[expansion:invalid-path-count]'
		);
	}
});

test('shell preserves deterministic non-zero status for diagnostics', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	await shell.$`echo |`.nothrow().text();
	expect(await shell.$`echo $status`.text()).toBe('1');

	await shell.$`grep -e`.nothrow().text();
	expect(await shell.$`echo $status`.text()).toBe('2');

	await shell.$`echo hello > *`.nothrow().text();
	expect(await shell.$`echo $status`.text()).toBe('1');
});
