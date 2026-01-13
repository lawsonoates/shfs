import {
	expandedWordToString,
	extractPathsFromExpandedWords,
	type PipelineIR,
} from '@shfs/compiler';
import { map, pipe } from 'remeda';
import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { headWithN } from '../operator/head/head';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { mv } from '../operator/mv/mv';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import { touch } from '../operator/touch/touch';
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
		case 'cat': {
			const filePaths = extractPathsFromExpandedWords(step.args.files);
			return {
				kind: 'stream',
				value: pipe(files(...filePaths), cat(fs)),
			};
		}
		case 'cp': {
			const srcPaths = extractPathsFromExpandedWords(step.args.srcs);
			const destPath = expandedWordToString(step.args.dest);
			return {
				kind: 'sink',
				value: Promise.all(
					map(srcPaths, (src) =>
						cp(fs)({
							src,
							dest: destPath,
							recursive: step.args.recursive,
						})
					)
				).then(),
			};
		}
		case 'head': {
			const filePaths = extractPathsFromExpandedWords(step.args.files);
			return {
				kind: 'stream',
				value: pipe(files(...filePaths), headWithN(fs, step.args.n)),
			};
		}
		case 'ls': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			return {
				kind: 'stream',
				value: (async function* () {
					const results = await Promise.all(
						map(paths, (path) => ls(fs, path))
					).then();

					for (const file of results) {
						yield* file;
					}
				})(),
			};
		}
		case 'mkdir': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			return {
				kind: 'sink',
				value: Promise.all(
					map(paths, (path) =>
						mkdir(fs)({ path, recursive: step.args.recursive })
					)
				).then(),
			};
		}
		case 'mv': {
			const srcPaths = extractPathsFromExpandedWords(step.args.srcs);
			const destPath = expandedWordToString(step.args.dest);
			return {
				kind: 'sink',
				value: mv(fs)({ srcs: srcPaths, dest: destPath }),
			};
		}
		case 'rm': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			return {
				kind: 'sink',
				value: Promise.all(
					map(paths, (path) =>
						rm(fs)({ path, recursive: step.args.recursive })
					)
				).then(),
			};
		}
		case 'tail': {
			const filePaths = extractPathsFromExpandedWords(step.args.files);
			return {
				kind: 'stream',
				value: (async function* () {
					const results = await Promise.all(
						map(filePaths, (file) =>
							pipe(files(file), cat(fs), tail(step.args.n))
						)
					);
					for (const lines of results) {
						yield* lines;
					}
				})(),
			};
		}
		case 'touch': {
			const filePaths = extractPathsFromExpandedWords(step.args.files);
			return {
				kind: 'sink',
				value: touch(fs)({ files: filePaths }),
			};
		}
		default:
			throw new Error(
				`Unknown command: ${String((step as { cmd: string }).cmd)}`
			);
	}
}
