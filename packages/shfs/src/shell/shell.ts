import { compile, parse, type ScriptIR } from '@shfs/compiler';

import { collect } from '../consumer/consumer';
import { type ExecuteResult, execute } from '../execute/execute';
import type { FS } from '../fs/fs';
import { formatRecord, type Record } from '../record';
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
	stdout(): Promise<void>;
	text(): Promise<string>;
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

async function collectRecords(result: ExecuteResult): Promise<Record[]> {
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
		const runWithContext = async (): Promise<Record[]> => {
			const commandStartCwd = normalizeCwd(
				cwdOverride ?? this.currentCwd
			);
			const context = {
				cwd: commandStartCwd,
				status: this.currentStatus,
				globalVars: this.globalVars,
				localVars: new Map<string, string>(),
			};
			try {
				return await collectRecords(execute(ir(), fs, context));
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
			const commandStartCwd = normalizeCwd(
				cwdOverride ?? this.currentCwd
			);
			const context = {
				cwd: commandStartCwd,
				status: this.currentStatus,
				globalVars: this.globalVars,
				localVars: new Map<string, string>(),
			};
			try {
				const result = execute(ir(), fs, context);
				if (result.kind === 'sink') {
					await result.value;
					return;
				}
				for await (const r of result.value) {
					if (r.kind === 'line') {
						process.stdout.write(`${r.text}\n`);
					}
				}
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
				const records = await runWithContext();
				return records
					.filter((r) => r.kind === 'json')
					.map((r) => r.value);
			},

			async lines(): Promise<string[]> {
				const records = await runWithContext();
				return records
					.filter((r) => r.kind === 'line')
					.map((r) => r.text);
			},

			async raw(): Promise<Record[]> {
				return await runWithContext();
			},

			async stdout(): Promise<void> {
				await runStdoutWithContext();
			},

			async text(): Promise<string> {
				const records = await runWithContext();
				return records.map((record) => formatRecord(record)).join('\n');
			},
		};

		return command;
	}
}
