import { expect, test } from 'bun:test';

import { MemoryFS } from '../fs/memory';
import { Shell } from './shell';

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

	const syntax = await shell.$`echo )`.stderrText();
	const usage = await shell.$`grep -e`.stderrText();
	const expansion = await shell.$`echo hello > *`.stderrText();

	expect(syntax).toContain('error[parse:unexpected-token]');
	expect(usage).toContain('error[compile:missing-value]');
	expect(expansion).toContain('error[expansion:invalid-path-count]');
});

test('shell command results expose explicit stdout, stderr, and exitCode channels', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	const success = await shell.$`pwd`.result();
	expect(success.stdout).toHaveLength(1);
	expect(success.stderr).toEqual([]);
	expect(success.exitCode).toBe(0);

	const failure = await shell.$`echo hello > *`.result();
	expect(failure.stdout).toEqual([]);
	expect(failure.stderr.join('\n')).toContain(
		'error[expansion:invalid-path-count]'
	);
	expect(failure.exitCode).toBe(1);
});

test('shell preserves deterministic non-zero status for diagnostics', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/a', true);
	await fs.mkdir('/workspace/b', true);
	const shell = new Shell(fs, { cwd: '/workspace' });

	await shell.$`echo |`.text();
	expect(await shell.$`echo $status`.text()).toBe('1');

	await shell.$`grep -e`.text();
	expect(await shell.$`echo $status`.text()).toBe('2');

	await shell.$`echo hello > *`.text();
	expect(await shell.$`echo $status`.text()).toBe('1');
});
