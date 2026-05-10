import { beforeEach } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../../../../packages/shfs/src/fs/memory';
import { Shell } from '../../../../../packages/shfs/src/shell/shell';

export interface CommandResult {
	output: string;
	stderr: string;
	status: number;
}

export interface TreeHarness {
	readonly fs: MemoryFS;
	ensureDir(path: string): Promise<void>;
	run(command: string): Promise<string>;
	runWithStatus(command: string): Promise<CommandResult>;
	setFile(path: string, content: string | Uint8Array): Promise<void>;
	setTextFile(path: string, content: string): Promise<void>;
	setupReferenceTree(root?: string): Promise<string>;
}

export function createTreeHarness(): TreeHarness {
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

	const setupReferenceTree = async (root = '/fixture'): Promise<string> => {
		await ensureDir(`${root}/src`);
		await ensureDir(`${root}/tests`);
		await ensureDir(`${root}/docs`);
		await ensureDir(`${root}/.git`);

		await setTextFile(`${root}/README.md`, '# Test');
		await setTextFile(`${root}/src/main.rs`, 'fn main() {}');
		await setTextFile(`${root}/src/lib.rs`, '// lib');
		await setTextFile(`${root}/tests/test.rs`, '// test');
		await setTextFile(`${root}/docs/guide.md`, '# Guide');
		await setTextFile(`${root}/.gitignore`, 'target/');

		return root;
	};

	return {
		get fs() {
			return fs;
		},
		ensureDir,
		run,
		runWithStatus,
		setFile,
		setTextFile,
		setupReferenceTree,
	};
}

export function expectContains(output: string, text: string): void {
	if (!output.includes(text)) {
		throw new Error(
			`Expected output to contain ${JSON.stringify(text)} but received ${JSON.stringify(output)}`
		);
	}
}

export function expectNotContains(output: string, text: string): void {
	if (output.includes(text)) {
		throw new Error(
			`Expected output not to contain ${JSON.stringify(text)} but received ${JSON.stringify(output)}`
		);
	}
}
