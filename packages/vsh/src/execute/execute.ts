import type { PipelineIR } from '@vsh/compiler/ir';
import { map, pipe } from 'remeda';
import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import type { Record } from '../record';
import type { Stream } from '../stream';
import { files } from './producers';

export type ExecuteResult =
	| { kind: 'stream'; value: Stream<Record> }
	| { kind: 'sink'; value: Promise<void> };

/**
 * Execute compiles a PipelineIR into an executable result.
 * Returns either a stream (for producers/transducers) or a promise (for sinks).
 */
export function execute(ir: PipelineIR, fs: FS): ExecuteResult {
	const step = ir.steps[0];
	if (!step) {
		return {
			kind: 'stream',
			value: (async function* () {
				// Empty stream - no steps to execute
			})(),
		};
	}

	switch (step.cmd) {
		case 'cat':
			return {
				kind: 'stream',
				value: pipe(files(...step.args.files), cat(fs)),
			};
		case 'cp':
			return {
				kind: 'sink',
				value: Promise.all(
					map(step.args.srcs, (src) =>
						cp(fs)({
							src,
							dest: step.args.dest,
							recursive: step.args.recursive,
						})
					)
				).then(),
			};
		case 'ls':
			return {
				kind: 'stream',
				value: (async function* () {
					const results = await Promise.all(
						map(step.args.paths, (path) => ls(fs, path))
					).then();

					for (const file of results) {
						yield* file;
					}
				})(),
			};
		case 'rm':
			return {
				kind: 'sink',
				value: Promise.all(
					map(step.args.paths, (path) =>
						rm(fs)({ path, recursive: step.args.recursive })
					)
				).then(),
			};
		case 'tail':
			return {
				kind: 'stream',
				value: (async function* () {
					const results = await Promise.all(
						map(step.args.files, (file) =>
							pipe(files(file), cat(fs), tail(step.args.n))
						)
					);
					for (const lines of results) {
						yield* lines;
					}
				})(),
			};
		case 'mkdir':
			return {
				kind: 'sink',
				value: Promise.all(
					map(step.args.paths, (path) =>
						mkdir(fs)({ path, recursive: step.args.recursive })
					)
				).then(),
			};
		default:
			throw new Error(
				`Unknown command: ${String((step as { cmd: string }).cmd)}`
			);
	}
}
