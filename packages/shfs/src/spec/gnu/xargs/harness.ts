import { beforeEach } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { MemoryFS } from '../../../fs/memory';
import { Shell } from '../../../shell/shell';

const GNU_XARGS_TESTSUITE_DIR = new URL('./testsuite/', import.meta.url);
const VIRTUAL_INPUT_DIR = '/xargs-inputs';
const TRAILING_NEWLINE_REGEX = /\n$/;
const XARGS_START_REGEX =
	/^xargs_start\s+(\S+)\s+\{([^}]*)\}(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(.+))?$/;

export type XargsSuite = 'xargs.gnu' | 'xargs.posix' | 'xargs.sysv';

interface ParsedXargsStart {
	expectedExitCode: number;
	inputFile: string | null;
	options: string;
	skipStderrCheck: boolean;
	unsupportedCommandOverride: string | null;
}

export interface XargsHarness {
	runDejaGnuCase(
		suite: XargsSuite,
		testName: string
	): Promise<XargsCaseResult>;
}

export interface XargsCaseResult {
	actualExitCode: number;
	actualOutput: string;
	actualStderr: string;
	expectedExitCode: number;
	expectedOutput: string;
	expectedStderr: string | null;
}

export function createXargsHarness(): XargsHarness {
	let fs!: MemoryFS;
	let shell!: Shell;

	beforeEach(() => {
		fs = new MemoryFS();
		shell = new Shell(fs);
	});

	const ensureDir = async (path: string): Promise<void> => {
		if (!(await fs.exists(path))) {
			await fs.mkdir(path, true);
		}
	};

	const setInputFixture = async (fileName: string): Promise<string> => {
		await ensureDir(VIRTUAL_INPUT_DIR);
		const virtualPath = `${VIRTUAL_INPUT_DIR}/${fileName}`;
		fs.setFile(virtualPath, readFixtureBytes(`inputs/${fileName}`));
		return virtualPath;
	};

	const runDejaGnuCase = async (
		suite: XargsSuite,
		testName: string
	): Promise<XargsCaseResult> => {
		const parsed = parseXargsStart(
			readFixtureText(`${suite}/${testName}.exp`)
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
			expectedOutput: readExpectedText(`${suite}/${testName}.xo`),
			expectedStderr: parsed.skipStderrCheck
				? null
				: readExpectedText(`${suite}/${testName}.xe`),
		};
	};

	return {
		runDejaGnuCase,
	};
}

function parseXargsStart(source: string): ParsedXargsStart {
	const line = source.trim();
	const match = XARGS_START_REGEX.exec(line);
	if (!match) {
		throw new Error(`Unsupported xargs_start form: ${line}`);
	}

	return {
		expectedExitCode: expectedExitCodeForPassFail(match[1] ?? ''),
		options: match[2] ?? '',
		inputFile: match[3] ?? null,
		skipStderrCheck: (match[4] ?? '').startsWith('s'),
		unsupportedCommandOverride: match[5] ?? null,
	};
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

function readFixtureBytes(relativePath: string): Uint8Array {
	return readFileSync(new URL(relativePath, GNU_XARGS_TESTSUITE_DIR));
}

function readFixtureText(relativePath: string): string {
	return readFileSync(new URL(relativePath, GNU_XARGS_TESTSUITE_DIR), 'utf8');
}

function readExpectedText(relativePath: string): string {
	const fixtureUrl = new URL(relativePath, GNU_XARGS_TESTSUITE_DIR);
	if (!existsSync(fixtureUrl)) {
		return '';
	}
	return readFixtureText(relativePath).replace(TRAILING_NEWLINE_REGEX, '');
}
