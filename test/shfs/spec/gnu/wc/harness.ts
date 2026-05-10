import { beforeEach } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../../../../packages/shfs/src/fs/memory';
import { Shell } from '../../../../../packages/shfs/src/shell/shell';

export interface CommandResult {
	output: string;
	stderr: string;
	status: number;
}

export interface WcHarness {
	readonly fs: MemoryFS;
	run(command: string): Promise<string>;
	runWithStatus(command: string): Promise<CommandResult>;
	setFile(path: string, content: string | Uint8Array): Promise<void>;
	setTextFile(path: string, content: string): Promise<void>;
	ensureDir(path: string): Promise<void>;
}

export function createWcHarness(): WcHarness {
	let fs!: MemoryFS;
	let shell!: Shell;

	beforeEach(() => {
		fs = new MemoryFS();
		shell = new Shell(fs);
	});

	const run = async (command: string): Promise<string> => {
		return await shell.$`${command}`.text();
	};

	const runWithStatus = async (command: string): Promise<CommandResult> => {
		const result = await shell.$`${command}`.nothrow();
		return {
			output: result.text(),
			status: result.exitCode,
			stderr: result.stderr.toString(),
		};
	};

	const ensureDir = async (path: string): Promise<void> => {
		if (path === '' || path === '/' || path === '.') {
			return;
		}
		if (await fs.exists(path)) {
			return;
		}
		await fs.mkdir(path, true);
	};

	const setFile = async (
		path: string,
		content: string | Uint8Array
	): Promise<void> => {
		await ensureDir(dirname(path));
		fs.setFile(path, content);
	};

	const setTextFile = async (
		path: string,
		content: string
	): Promise<void> => {
		await setFile(path, content);
	};

	return {
		get fs() {
			return fs;
		},
		run,
		runWithStatus,
		setFile,
		setTextFile,
		ensureDir,
	};
}

export function nulSeparated(...paths: string[]): Uint8Array {
	return new TextEncoder().encode(`${paths.join('\0')}\0`);
}
