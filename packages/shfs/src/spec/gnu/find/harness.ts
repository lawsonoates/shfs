import { beforeEach } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../../fs/memory';
import { Shell } from '../../../shell/shell';

const STATUS_PREFIX = '__SHFS_STATUS__=';

export interface CommandResult {
	output: string;
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

	const parseStatus = (text: string): CommandResult => {
		const lines = text === '' ? [] : text.split('\n');
		const marker = lines.at(-1);
		if (marker === undefined || !marker.startsWith(STATUS_PREFIX)) {
			throw new Error(
				`Expected trailing status marker in output: ${JSON.stringify(text)}`
			);
		}

		const statusText = marker.slice(STATUS_PREFIX.length);
		const status = Number.parseInt(statusText, 10);
		if (Number.isNaN(status)) {
			throw new Error(`Invalid status marker: ${marker}`);
		}

		return {
			output: lines.slice(0, -1).join('\n'),
			status,
		};
	};

	const runWithStatus = async (command: string): Promise<CommandResult> => {
		const text = await run(`${command}; echo "${STATUS_PREFIX}$status"`);
		return parseStatus(text);
	};

	const runWithStderr = async (command: string): Promise<CommandResult> => {
		const text = await run(
			`${command} 2>&1; echo "${STATUS_PREFIX}$status"`
		);
		return parseStatus(text);
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
