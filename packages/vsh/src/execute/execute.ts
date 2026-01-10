import type { PipelineIR } from '@vsh/compiler/ir';
import * as R from 'remeda';

import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { ls } from '../operator/ls/ls';
import { pwd } from '../operator/pwd/pwd';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import type { Record } from '../record';
import type { Stream } from '../stream';
import { files } from './producers';

export type ExecuteResult =
	| { kind: 'stream'; stream: Stream<Record> }
	| { kind: 'sink'; promise: Promise<void> };

/**
 * Execute compiles a PipelineIR into an executable result.
 * Returns either a stream (for producers/transducers) or a promise (for sinks).
 */
export function execute(ir: PipelineIR, fs: FS): ExecuteResult {
	const step = ir.steps[0];
	if (!step) {
		return { kind: 'stream', stream: (async function* () {})() };
	}

	// Get source file(s) from IR
	const sourceGlob = ir.source.kind === 'fs' ? ir.source.glob : '';

	switch (step.cmd) {
		case 'cat':
			return {
				kind: 'stream',
				stream: R.pipe(files(fs, ...step.args.files)(), cat(fs)),
			};
		case 'cp':
			return {
				kind: 'sink',
				promise: R.pipe(
					(async function* () {
						for (const src of step.args.srcs) {
							yield* files(fs, src)();
						}
					})(),
					cp(fs, step.args.dest),
				),
			};
		case 'ls':
			return {
				kind: 'stream',
				stream: R.pipe(
					(async function* () {
						for (const path of step.args.paths) {
							yield* ls(fs, path)();
						}
					})(),
				),
			};
		case 'pwd':
			return { kind: 'stream', stream: R.pipe(pwd(fs)()) };
		case 'rm':
			return {
				kind: 'sink',
				promise: R.pipe(
					(async function* () {
						for (const path of step.args.paths) {
							yield* files(fs, path)();
						}
					})(),
					rm(fs),
				),
			};
		case 'tail':
			return {
				kind: 'stream',
				stream: R.pipe(
					(async function* () {
						if (step.args.files.length === 0) {
							yield* files(fs, sourceGlob)();
						} else {
							for (const file of step.args.files) {
								yield* files(fs, file)();
							}
						}
					})(),
					cat(fs),
					tail(step.args.n),
				),
			};
	}
}
