import { beforeEach } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path/posix';

import { MemoryFS } from '#shfs/fs/memory';
import { Shell } from '#shfs/shell/shell';

const textDecoder = new TextDecoder();
const TRAILING_NEWLINE_REGEX = /\n$/;
const XARGS_START_REGEX =
	/^xargs_start\s+(\S+)\s+\{([^}]*)\}(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(.+))?$/;

const GNU_GREP_TESTS_DIR = new URL(
	'./shfs/spec/gnu/grep/fixtures/',
	import.meta.url
);
const GNU_XARGS_TESTSUITE_DIR = new URL(
	'./shfs/spec/gnu/xargs/testsuite/',
	import.meta.url
);
const VIRTUAL_XARGS_INPUT_DIR = '/xargs-inputs';

export namespace Harness {
	export interface CreateOptions {
		cwd?: string;
	}

	export interface CommandResult {
		exitCode: number;
		output: string;
		status: number;
		stderr: string;
		stdout: string;
	}

	export interface CorpusCase {
		expectedStatus: number;
		input: string;
		line: number;
		pattern: string;
	}

	export interface FileTree {
		[path: string]: FileTree | Uint8Array | string;
	}

	export interface Instance {
		readonly fs: MemoryFS;
		readonly shell: Shell;
		ensureDir(path: string): Promise<void>;
		expectMissing(path: string): Promise<void>;
		expectTextFile(path: string, expected: string): Promise<void>;
		readTextFile(path: string): Promise<string>;
		run(command: string): Promise<string>;
		runDejaGnuCase(
			suite: XargsSuite,
			testName: string
		): Promise<XargsCaseResult>;
		runResult(command: string): Promise<CommandResult>;
		runWithStderr(command: string): Promise<CommandResult>;
		runWithStatus(command: string): Promise<CommandResult>;
		setFile(path: string, content: string | Uint8Array): Promise<void>;
		setFiles(files: FileTree, root?: string): Promise<void>;
		setTextFile(path: string, content: string): Promise<void>;
		setupReferenceTree(root?: string): Promise<string>;
	}

	export type XargsSuite = 'xargs.gnu' | 'xargs.posix' | 'xargs.sysv';

	export interface XargsCaseResult {
		actualExitCode: number;
		actualOutput: string;
		actualStderr: string;
		expectedExitCode: number;
		expectedOutput: string;
		expectedStderr: string | null;
	}

	interface ParsedXargsStart {
		expectedExitCode: number;
		inputFile: string | null;
		options: string;
		skipStderrCheck: boolean;
		unsupportedCommandOverride: string | null;
	}

	export function create(options: CreateOptions = {}): Instance {
		let fs!: MemoryFS;
		let shell!: Shell;

		beforeEach(() => {
			fs = new MemoryFS();
			shell = new Shell(fs, options);
		});

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

		const setFiles = async (files: FileTree, root = '/'): Promise<void> => {
			for (const [name, content] of Object.entries(files)) {
				const path = toVirtualPath(root, name);
				if (isFileTree(content)) {
					await ensureDir(path);
					await setFiles(content, path);
					continue;
				}
				await setFile(path, content);
			}
		};

		const readTextFile = async (path: string): Promise<string> => {
			return textDecoder.decode(await fs.readFile(path));
		};

		const runResult = async (command: string): Promise<CommandResult> => {
			const result = await shell.$`${command}`.nothrow();
			const stdout = result.text();
			const exitCode = result.exitCode;

			return {
				exitCode,
				output: stdout,
				status: exitCode,
				stderr: result.stderr.toString(),
				stdout,
			};
		};

		const setupReferenceTree = async (
			root = '/fixture'
		): Promise<string> => {
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

		const setInputFixture = async (fileName: string): Promise<string> => {
			await ensureDir(VIRTUAL_XARGS_INPUT_DIR);
			const virtualPath = `${VIRTUAL_XARGS_INPUT_DIR}/${fileName}`;
			fs.setFile(
				virtualPath,
				readXargsFixtureBytes(`inputs/${fileName}`)
			);
			return virtualPath;
		};

		const runDejaGnuCase = async (
			suite: XargsSuite,
			testName: string
		): Promise<XargsCaseResult> => {
			const parsed = parseXargsStart(
				readXargsFixtureText(`${suite}/${testName}.exp`)
			);
			if (parsed.unsupportedCommandOverride) {
				throw new Error(
					`Unsupported xargs test command override in ${suite}/${testName}.exp`
				);
			}

			const inputRedirect = parsed.inputFile
				? ` < ${await setInputFixture(parsed.inputFile)}`
				: '';
			const command = `xargs${parsed.options === '' ? '' : ` ${parsed.options}`}${inputRedirect}`;
			const result = await shell.$`${command}`.nothrow();

			return {
				actualExitCode: result.exitCode,
				actualOutput: result.text(),
				actualStderr: result.stderr.toString(),
				expectedExitCode: parsed.expectedExitCode,
				expectedOutput: readXargsExpectedText(
					`${suite}/${testName}.xo`
				),
				expectedStderr: parsed.skipStderrCheck
					? null
					: readXargsExpectedText(`${suite}/${testName}.xe`),
			};
		};

		return {
			get fs() {
				return fs;
			},
			get shell() {
				return shell;
			},
			ensureDir,
			expectMissing: async (path) => {
				if (await fs.exists(path)) {
					throw new Error(`Expected ${path} not to exist`);
				}
			},
			expectTextFile: async (path, expected) => {
				const actual = await readTextFile(path);
				if (actual !== expected) {
					throw new Error(
						`Expected ${path} to contain ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
					);
				}
			},
			readTextFile,
			run: async (command) => {
				return await shell.$`${command}`.text();
			},
			runDejaGnuCase,
			runResult,
			runWithStderr: runResult,
			runWithStatus: runResult,
			setFile,
			setFiles,
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

	export function nulSeparated(...paths: string[]): Uint8Array {
		return new TextEncoder().encode(`${paths.join('\0')}\0`);
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

			cases.push({
				expectedStatus,
				input: decodeCorpusInput(fields[2] ?? ''),
				line: index + 1,
				pattern: fields[1] ?? '',
			});
		}

		return cases;
	}

	export function quote(value: string): string {
		return `'${value.replaceAll("'", `'"'"'`)}'`;
	}

	export function readFixture(fileName: string): string {
		return readFileSync(new URL(fileName, GNU_GREP_TESTS_DIR), 'utf8');
	}

	export function sortedLines(text: string): string {
		if (text === '') {
			return '';
		}
		return text.split('\n').sort().join('\n');
	}

	function expectedExitCodeForPassFail(passFail: string): number {
		const numeric = Number.parseInt(passFail, 10);
		if (!Number.isNaN(numeric)) {
			return numeric;
		}
		if (passFail.startsWith('p')) {
			return 0;
		}
		if (passFail.startsWith('f')) {
			return 1;
		}
		throw new Error(`Unsupported xargs pass/fail marker: ${passFail}`);
	}

	function parseXargsStart(source: string): ParsedXargsStart {
		const line = source.trim();
		const match = XARGS_START_REGEX.exec(line);
		if (!match) {
			throw new Error(`Unsupported xargs_start form: ${line}`);
		}

		return {
			expectedExitCode: expectedExitCodeForPassFail(match[1] ?? ''),
			inputFile: match[3] ?? null,
			options: match[2] ?? '',
			skipStderrCheck: (match[4] ?? '').startsWith('s'),
			unsupportedCommandOverride: match[5] ?? null,
		};
	}
}

function decodeCorpusInput(value: string): string {
	if (value === '""') {
		return '';
	}
	return value;
}

function isFileTree(
	value: Harness.FileTree | Uint8Array | string
): value is Harness.FileTree {
	return (
		typeof value === 'object' &&
		value !== null &&
		!(value instanceof Uint8Array)
	);
}

function readXargsExpectedText(relativePath: string): string {
	const fixtureUrl = new URL(relativePath, GNU_XARGS_TESTSUITE_DIR);
	if (!existsSync(fixtureUrl)) {
		return '';
	}
	return readXargsFixtureText(relativePath).replace(
		TRAILING_NEWLINE_REGEX,
		''
	);
}

function readXargsFixtureBytes(relativePath: string): Uint8Array {
	return readFileSync(new URL(relativePath, GNU_XARGS_TESTSUITE_DIR));
}

function readXargsFixtureText(relativePath: string): string {
	return readFileSync(new URL(relativePath, GNU_XARGS_TESTSUITE_DIR), 'utf8');
}

function toVirtualPath(root: string, path: string): string {
	if (path.startsWith('/')) {
		return path;
	}
	return join(root, path);
}
