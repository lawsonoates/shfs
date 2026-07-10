import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// shfs regression: upstream Fish has no direct function-redirection case.
test('function input redirection overrides pipeline stdin', async () => {
	await run('echo redirected > /tmp/function-input.txt');
	const script = [
		'function consume',
		'    read value',
		'    echo $value',
		'end',
		'echo pipeline | consume < /tmp/function-input.txt',
	].join('\n');

	expect(await run(script)).toBe('redirected');
});

test('function definitions persist across shell API invocations', async () => {
	await run('function keeper\n    echo kept\nend');
	expect(await run('keeper')).toBe('kept');
});
