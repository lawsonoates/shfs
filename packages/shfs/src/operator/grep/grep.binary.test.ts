import { beforeEach, expect, test } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

interface CommandResult {
	output: string;
	status: number;
}

let fs!: MemoryFS;
let shell!: Shell;

beforeEach(() => {
	fs = new MemoryFS();
	shell = new Shell(fs);
});

const runWithStatus = async (command: string): Promise<CommandResult> => {
	const result = await shell.$`${command}`.nothrow();
	return {
		output: result.text(),
		status: result.exitCode,
	};
};

const setFile = async (
	path: string,
	content: string | Uint8Array
): Promise<void> => {
	await fs.mkdir(dirname(path), true);
	fs.setFile(path, content);
};

const writeBinaryFixture = async (): Promise<void> => {
	await setFile(
		'/tmp/in.bin',
		new Uint8Array([0x66, 0x6f, 0x6f, 0x0a, 0x00])
	);
};

test('default mode reports "Binary file ... matches" when binary input matches', async () => {
	await writeBinaryFixture();

	const result = await runWithStatus('grep foo /tmp/in.bin');
	expect(result.status).toBe(0);
	expect(result.output).toBe('Binary file /tmp/in.bin matches');
});

test('--binary-files=binary keeps GNU default binary-match reporting', async () => {
	await writeBinaryFixture();

	const result = await runWithStatus(
		'grep --binary-files=binary foo /tmp/in.bin'
	);
	expect(result.status).toBe(0);
	expect(result.output).toBe('Binary file /tmp/in.bin matches');
});

test('-I and --binary-files=without-match suppress binary matches', async () => {
	await writeBinaryFixture();

	for (const option of ['-I', '--binary-files=without-match']) {
		const result = await runWithStatus(`grep ${option} foo /tmp/in.bin`);
		expect(result.status).toBe(1);
		expect(result.output).toBe('');
	}
});

test('-a and --binary-files=text treat binary inputs as text', async () => {
	await writeBinaryFixture();

	for (const option of ['-a', '--binary-files=text']) {
		const result = await runWithStatus(`grep ${option} foo /tmp/in.bin`);
		expect(result.status).toBe(0);
		expect(result.output).toBe('foo');
	}
});
