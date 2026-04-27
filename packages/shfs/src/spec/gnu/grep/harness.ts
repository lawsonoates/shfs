import { beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { MemoryFS } from '../../../fs/memory';
import { Shell } from '../../../shell/shell';

const GNU_GREP_TESTS_DIR = new URL('./fixtures/', import.meta.url);

export interface CommandResult {
	output: string;
	status: number;
}

export interface CorpusCase {
	expectedStatus: number;
	pattern: string;
	input: string;
	line: number;
}

export interface GrepHarness {
	readonly fs: MemoryFS;
	run(command: string): Promise<string>;
	runWithStatus(command: string): Promise<CommandResult>;
	setFile(path: string, content: string | Uint8Array): Promise<void>;
	setTextFile(path: string, content: string): Promise<void>;
	ensureDir(path: string): Promise<void>;
}

export function createGrepHarness(): GrepHarness {
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

export function quote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function readFixture(fileName: string): string {
	return readFileSync(new URL(fileName, GNU_GREP_TESTS_DIR), 'utf8');
}

export function parseAtDelimitedCorpus(
	fileName: string,
	acceptedFieldCounts: readonly number[] = [3]
): CorpusCase[] {
	const accepted = new Set(acceptedFieldCounts);
	const content = readFixture(fileName);
	const lines = content.split('\n');
	const cases: CorpusCase[] = [];

	for (const [index, rawLine] of lines.entries()) {
		if (rawLine === '' || rawLine.startsWith('#')) {
			continue;
		}

		const fields = rawLine.split('@');
		if (!accepted.has(fields.length)) {
			continue;
		}

		const expectedStatus = Number.parseInt(fields[0] ?? '', 10);
		if (Number.isNaN(expectedStatus)) {
			continue;
		}

		const pattern = fields[1] ?? '';
		const input = decodeCorpusInput(fields[2] ?? '');

		cases.push({
			expectedStatus,
			pattern,
			input,
			line: index + 1,
		});
	}

	return cases;
}

function decodeCorpusInput(value: string): string {
	if (value === '""') {
		return '';
	}
	return value;
}
