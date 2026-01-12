import { compile } from '@vsh/compiler/compile';
import type { PipelineIR } from '@vsh/compiler/ir';
import { parse } from '@vsh/compiler/parser';

import { collect } from '../consumer/consumer';
import { type ExecuteResult, execute } from '../execute/execute';
import type { FS } from '../fs/fs';
import type { Record } from '../record';
import { lazy } from '../util/lazy';

async function collectRecords(result: ExecuteResult): Promise<Record[]> {
	if (result.kind === 'sink') {
		await result.promise;
		return [];
	}
	return collect<Record>()(result.stream);
}

export class Shell {
	private readonly fs: FS;

	constructor(fs: FS) {
		this.fs = fs;
	}

	$ = (strings: TemplateStringsArray, ...exprs: unknown[]) => {
		return this._exec(strings, ...exprs);
	};

	exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		return this._exec(strings, ...exprs);
	}

	private _exec(strings: TemplateStringsArray, ...exprs: unknown[]) {
		const source = String.raw(strings, ...exprs);
		const fs = this.fs;

		const ir = lazy<PipelineIR>(() => {
			const ast = parse(source);
			return compile(ast);
		});

		return {
			async json(): Promise<unknown[]> {
				const records = await collectRecords(execute(ir(), fs));
				return records
					.filter((r) => r.kind === 'json')
					.map((r) => r.value);
			},

			async lines(): Promise<string[]> {
				const records = await collectRecords(execute(ir(), fs));
				return records
					.filter((r) => r.kind === 'line')
					.map((r) => r.text);
			},

			async raw(): Promise<Record[]> {
				return await collectRecords(execute(ir(), fs));
			},

			async stdout(): Promise<void> {
				const result = execute(ir(), fs);
				if (result.kind === 'sink') {
					await result.promise;
					return;
				}
				for await (const r of result.stream) {
					if (r.kind === 'line') {
						process.stdout.write(`${r.text}\n`);
					}
				}
			},

			async text(): Promise<string> {
				const records = await collectRecords(execute(ir(), fs));
				return records
					.map((r) => {
						if (r.kind === 'line') {
							return r.text;
						}
						if (r.kind === 'file') {
							return r.path;
						}
						if (r.kind === 'json') {
							return JSON.stringify(r.value);
						}
						return '';
					})
					.join('\n');
			},
		};
	}
}
