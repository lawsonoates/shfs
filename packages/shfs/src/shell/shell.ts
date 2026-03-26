import {
	compile,
	ParseSyntaxError,
	parse,
	type ScriptIR,
} from '@shfs/compiler';

import { collect } from '../consumer/consumer';
import {
	isShellDiagnosticError,
	writeDiagnosticsToStderr,
} from '../diagnostics';
import { type ExecuteResult, execute } from '../execute/execute';
import type { FS } from '../fs/fs';
import type { ShellCommandResult } from '../output-channels';
import { formatRecord, type Record } from '../record';
import { formatStderr } from '../stderr';
import { lazy } from '../util/lazy';

const ROOT_DIRECTORY = '/';
const MULTIPLE_SLASH_REGEX = /\/+/g;
const TRAILING_SLASH_REGEX = /\/+$/;

export interface ShellOptions {
	cwd?: string;
}

export interface ShellCommand {
	cwd(path: string): ShellCommand;
	json(): Promise<unknown[]>;
	lines(): Promise<string[]>;
	raw(): Promise<Record[]>;
	result(): Promise<ShellCommandResult>;
	stderrLines(): Promise<string[]>;
	stderrText(): Promise<string>;
	stdout(): Promise<void>;
	text(): Promise<string>;
	stdoutLines(): Promise<string[]>;
	stdoutText(): Promise<string>;
}

function normalizeAbsolutePath(path: string): string {
	const withLeadingSlash = path.startsWith(ROOT_DIRECTORY)
		? path
		: `${ROOT_DIRECTORY}${path}`;
	const singleSlashes = withLeadingSlash.replace(MULTIPLE_SLASH_REGEX, '/');
	const segments = singleSlashes.split(ROOT_DIRECTORY);
	const normalizedSegments: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') {
			continue;
		}
		if (segment === '..') {
			normalizedSegments.pop();
			continue;
		}
		normalizedSegments.push(segment);
	}
	return `${ROOT_DIRECTORY}${normalizedSegments.join(ROOT_DIRECTORY)}`;
}

function normalizeCwd(cwd: string): string {
	if (cwd === '') {
		return ROOT_DIRECTORY;
	}
	const normalized = normalizeAbsolutePath(cwd);
	const trimmed = normalized.replace(TRAILING_SLASH_REGEX, '');
	return trimmed === '' ? ROOT_DIRECTORY : trimmed;
}

async function collectStdoutRecords(result: ExecuteResult): Promise<Record[]> {
	if (result.kind === 'sink') {
		await result.value;
		return [];
	}
	return collect<Record>()(result.value);
}

export class Shell {
	private readonly fs: FS;
	private currentCwd: string;
	private currentStatus = 0;
	private readonly globalVars = new Map<string, string>();

	constructor(fs: FS, options: ShellOptions = {}) {
		this.fs = fs;
		this.currentCwd = normalizeCwd(options.cwd ?? ROOT_DIRECTORY);
	}

	$ = (strings: TemplateStringsArray, ...exprs: unknown[]) => {
		return this._exec(strings, ...exprs);
	};

	exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		return this._exec(strings, ...exprs);
	}

	cwd(newCwd: string): void {
		this.currentCwd = normalizeCwd(newCwd);
	}

	private _exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		const source = String.raw(strings, ...exprs);
		const fs = this.fs;
		let cwdOverride: string | undefined;
		const runWithContext = async (): Promise<ShellCommandResult> => {
			const commandStartCwd = normalizeCwd(
				cwdOverride ?? this.currentCwd
			);
			const context = {
				cwd: commandStartCwd,
				status: this.currentStatus,
				stderr: [] as string[],
				globalVars: this.globalVars,
				localVars: new Map<string, string>(),
			};
			try {
				return {
					stdout: await collectStdoutRecords(
						execute(ir(), fs, context)
					),
					stderr: [...context.stderr],
					exitCode: context.status,
				};
			} catch (error) {
				handleDiagnosticFailure(error, context);
				return {
					stdout: [],
					stderr: [...context.stderr],
					exitCode: context.status ?? 1,
				};
			} finally {
				this.currentStatus = context.status ?? this.currentStatus;
				if (
					cwdOverride === undefined ||
					context.cwd !== commandStartCwd
				) {
					this.currentCwd = context.cwd;
				}
			}
		};
		const runStdoutWithContext = async (): Promise<void> => {
			const result = await runWithContext();
			for (const record of result.stdout) {
				process.stdout.write(`${formatRecord(record)}\n`);
			}
		};

		const ir = lazy<ScriptIR>(() => {
			const ast = parse(source);
			return compile(ast);
		});

		const command: ShellCommand = {
			cwd(path: string): ShellCommand {
				cwdOverride = normalizeCwd(path);
				return command;
			},

			async json(): Promise<unknown[]> {
				const result = await runWithContext();
				return result.stdout
					.filter((r) => r.kind === 'json')
					.map((r) => r.value);
			},

			async lines(): Promise<string[]> {
				return await command.stdoutLines();
			},

			async raw(): Promise<Record[]> {
				const result = await runWithContext();
				return [...result.stdout];
			},

			async result(): Promise<ShellCommandResult> {
				return await runWithContext();
			},

			async stderrLines(): Promise<string[]> {
				const result = await runWithContext();
				return [...result.stderr];
			},

			async stderrText(): Promise<string> {
				const result = await runWithContext();
				return formatStderr(result.stderr);
			},

			async stdout(): Promise<void> {
				await runStdoutWithContext();
			},

			async stdoutLines(): Promise<string[]> {
				const result = await runWithContext();
				return result.stdout
					.filter((r) => r.kind === 'line')
					.map((r) => r.text);
			},

			async text(): Promise<string> {
				return await command.stdoutText();
			},

			async stdoutText(): Promise<string> {
				const result = await runWithContext();
				return result.stdout
					.map((record) => formatRecord(record))
					.join('\n');
			},
		};

		return command;
	}
}

function handleDiagnosticFailure(
	error: unknown,
	context: {
		status?: number;
		stderr: string[];
	}
): void {
	if (error instanceof ParseSyntaxError) {
		context.status = 1;
		writeDiagnosticsToStderr(context, [error.diagnostic]);
		return;
	}
	if (isShellDiagnosticError(error)) {
		context.status = error.exitCode;
		writeDiagnosticsToStderr(context, error.diagnostics);
		return;
	}
	context.status = 1;
	throw error;
}
