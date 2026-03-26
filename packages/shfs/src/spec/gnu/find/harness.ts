import { beforeEach } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../../fs/memory';
import { formatRecord } from '../../../record';
import { Shell } from '../../../shell/shell';
import { formatStderr } from '../../../stderr';

export interface CommandResult {
	output: string;
	stderr: string;
	exitCode: number;
	status: number;
}

export interface FindHarness {
	readonly fs: MemoryFS;
	run(command: string): Promise<string>;
	runWithStatus(command: string): Promise<CommandResult>;
	runWithStderr(command: string): Promise<CommandResult>;
	setFile(path: string, content: string | Uint8Array): Promise<void>;
	setTextFile(path: string, content: string): Promise<void>;
	ensureDir(path: string): Promise<void>;
}

export function createFindHarness(): FindHarness {
	let fs!: MemoryFS;
	let shell!: Shell;

	beforeEach(() => {
		fs = new MemoryFS();
		shell = new Shell(fs);
	});

	const run = async (command: string): Promise<string> => {
		return await shell.$`${command}`.text();
	};

	const toCommandResult = async (command: string): Promise<CommandResult> => {
		const result = await shell.$`${command}`.result();
		return {
			output: result.stdout
				.map((record) => formatRecord(record))
				.join('\n'),
			stderr: formatStderr(result.stderr),
			exitCode: result.exitCode,
			status: result.exitCode,
		};
	};

	const runWithStatus = async (command: string): Promise<CommandResult> => {
		return await toCommandResult(command);
	};

	const runWithStderr = async (command: string): Promise<CommandResult> => {
		return await toCommandResult(command);
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
		runWithStderr,
		setFile,
		setTextFile,
		ensureDir,
	};
}

export function quote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function sortedLines(text: string): string {
	if (text === '') {
		return '';
	}
	return text.split('\n').sort().join('\n');
}
