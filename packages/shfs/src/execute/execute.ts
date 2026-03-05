import type {
	PipelineIR,
	ScriptIR,
	StatementChainModeIR,
	StepIR,
} from '@shfs/compiler';
import { cd } from '../builtin/cd/cd';
import { echo } from '../builtin/echo/echo';
import { read } from '../builtin/read/read';
import { set } from '../builtin/set/set';
import { string } from '../builtin/string/string';
import { test } from '../builtin/test/test';
import type { BuiltinContext, BuiltinRuntime } from '../builtin/types';
import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { runGrepCommand } from '../operator/grep/grep';
import { headLines, headWithN } from '../operator/head/head';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { mv } from '../operator/mv/mv';
import { pwd } from '../operator/pwd/pwd';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import { touch } from '../operator/touch/touch';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import {
	evaluateExpandedPathWord,
	evaluateExpandedPathWords,
	normalizeCwd,
	resolvePathsFromCwd,
} from './path';
import { files } from './producers';
import { toLineStream } from './records';
import {
	applyOutputRedirect,
	getRedirectPath,
	type ExecuteResult as RedirectExecuteResult,
	withInputRedirect,
} from './redirection';

export type { ExecuteResult } from './redirection';

export interface ExecuteContext {
	cwd: string;
	status?: number;
	globalVars?: Map<string, string>;
	localVars?: Map<string, string>;
}

type NormalizedExecuteContext = BuiltinContext;

type EffectStep = Extract<
	StepIR,
	{ cmd: 'cd' | 'cp' | 'mkdir' | 'mv' | 'rm' | 'touch' }
>;

type StreamStep = Exclude<StepIR, EffectStep>;

const EFFECT_COMMANDS = new Set(['cd', 'cp', 'mkdir', 'mv', 'rm', 'touch']);
const GLOB_PATTERN_REGEX = /[*?[]/;
const ROOT_DIRECTORY = '/';
const TRAILING_SLASH_REGEX = /\/+$/;

function isEffectStep(step: StepIR): step is EffectStep {
	return EFFECT_COMMANDS.has(step.cmd);
}

async function* emptyStream<T>(): Stream<T> {
	// no records
}

/**
 * Execute compiles ScriptIR/PipelineIR into an executable result.
 * Returns either a stream (for producers/transducers) or a promise (for sinks).
 */
export function execute(
	ir: PipelineIR | ScriptIR,
	fs: FS,
	context: ExecuteContext = { cwd: ROOT_DIRECTORY }
): RedirectExecuteResult {
	const normalizedContext = normalizeContext(context);
	const scriptIR = isScriptIR(ir) ? ir : toScriptIR(ir);
	return executeScript(scriptIR, fs, normalizedContext);
}

function isScriptIR(ir: PipelineIR | ScriptIR): ir is ScriptIR {
	return 'statements' in ir;
}

function toScriptIR(pipeline: PipelineIR): ScriptIR {
	return {
		statements: [
			{
				chainMode: 'always',
				pipeline,
			},
		],
	};
}

function isPipelineSink(pipeline: PipelineIR): boolean {
	const finalStep = pipeline.steps.at(-1);
	if (!finalStep) {
		return false;
	}

	return (
		isEffectStep(finalStep) ||
		getRedirectPath(finalStep.redirections, 'output') !== null
	);
}

function shouldExecuteStatement(
	chainMode: StatementChainModeIR,
	previousStatus: number
): boolean {
	if (chainMode === 'always') {
		return true;
	}
	if (chainMode === 'and') {
		return previousStatus === 0;
	}
	return previousStatus !== 0;
}

function executeScript(
	script: ScriptIR,
	fs: FS,
	context: NormalizedExecuteContext
): RedirectExecuteResult {
	if (script.statements.length === 0) {
		return {
			kind: 'stream',
			value: emptyStream<ShellRecord>(),
		};
	}

	if (
		script.statements.every((statement) =>
			isPipelineSink(statement.pipeline)
		)
	) {
		return {
			kind: 'sink',
			value: runScriptToCompletion(script, fs, context),
		};
	}

	return {
		kind: 'stream',
		value: runScriptToStream(script, fs, context),
	};
}

async function runScriptToCompletion(
	script: ScriptIR,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<void> {
	for (const statement of script.statements) {
		if (!shouldExecuteStatement(statement.chainMode, context.status)) {
			continue;
		}
		try {
			const result = executePipeline(statement.pipeline, fs, context);
			await drainResult(result);
		} catch (error) {
			context.status = 1;
			throw error;
		}
	}
}

async function* runScriptToStream(
	script: ScriptIR,
	fs: FS,
	context: NormalizedExecuteContext
): Stream<ShellRecord> {
	for (const statement of script.statements) {
		if (!shouldExecuteStatement(statement.chainMode, context.status)) {
			continue;
		}
		try {
			const result = executePipeline(statement.pipeline, fs, context);
			if (result.kind === 'sink') {
				await result.value;
				continue;
			}
			yield* result.value;
		} catch (error) {
			context.status = 1;
			throw error;
		}
	}
}

async function drainResult(result: RedirectExecuteResult): Promise<void> {
	if (result.kind === 'sink') {
		await result.value;
		return;
	}

	for await (const _record of result.value) {
		// drain stream output to complete side effects.
	}
}

function executePipeline(
	ir: PipelineIR,
	fs: FS,
	context: NormalizedExecuteContext
): RedirectExecuteResult {
	if (ir.steps.length === 0) {
		return {
			kind: 'stream',
			value: emptyStream<ShellRecord>(),
		};
	}

	const lastStep = ir.steps.at(-1);
	if (!lastStep) {
		return {
			kind: 'stream',
			value: emptyStream<ShellRecord>(),
		};
	}

	if (isEffectStep(lastStep)) {
		for (const [index, step] of ir.steps.entries()) {
			if (isEffectStep(step) && index !== ir.steps.length - 1) {
				throw new Error(
					`Unsupported pipeline: "${step.cmd}" must be the final command`
				);
			}
		}

		const sink = executePipelineToSink(ir.steps, fs, context);
		return applyOutputRedirect(
			{
				kind: 'sink',
				value: sink,
			},
			lastStep,
			fs
		);
	}

	const stream = executePipelineToStream(ir.steps, fs, context);
	return applyOutputRedirect(
		{
			kind: 'stream',
			value: stream,
		},
		lastStep,
		fs
	);
}

function executePipelineToStream(
	steps: StepIR[],
	fs: FS,
	context: NormalizedExecuteContext
): Stream<ShellRecord> {
	return (async function* () {
		let stream: Stream<ShellRecord> | null = null;
		for (const step of steps) {
			if (isEffectStep(step)) {
				throw new Error(
					`Unsupported pipeline: "${step.cmd}" requires being the final command`
				);
			}
			stream = executeStreamStep(step, fs, stream, context);
		}

		if (!stream) {
			return;
		}
		yield* stream;
	})();
}

async function executePipelineToSink(
	steps: StepIR[],
	fs: FS,
	context: NormalizedExecuteContext
): Promise<void> {
	const finalStep = steps.at(-1);
	if (!(finalStep && isEffectStep(finalStep))) {
		return;
	}

	if (steps.length > 1) {
		const stream = executePipelineToStream(steps.slice(0, -1), fs, context);
		for await (const _record of stream) {
			// drain
		}
	}

	await executeEffectStep(finalStep, fs, context);
}

function executeStreamStep(
	step: StreamStep,
	fs: FS,
	input: Stream<ShellRecord> | null,
	context: NormalizedExecuteContext
): Stream<ShellRecord> {
	const builtinRuntime = createBuiltinRuntime(fs, context, input);

	switch (step.cmd) {
		case 'cat': {
			return (async function* (): Stream<ShellRecord> {
				const options = {
					numberLines: step.args.numberLines,
					numberNonBlank: step.args.numberNonBlank,
					showAll: step.args.showAll,
					showEnds: step.args.showEnds,
					showNonprinting: step.args.showNonprinting,
					showTabs: step.args.showTabs,
					squeezeBlank: step.args.squeezeBlank,
				};
				const inputPath = getRedirectPath(step.redirections, 'input');
				const filePaths = withInputRedirect(
					resolvePathsFromCwd(
						context.cwd,
						await evaluateExpandedPathWords(
							'cat',
							step.args.files,
							fs,
							context
						)
					),
					inputPath
				);
				if (filePaths.length > 0) {
					yield* cat(fs, options)(files(...filePaths));
					context.status = 0;
					return;
				}
				if (input) {
					yield* cat(fs, options)(input);
				}
				context.status = 0;
			})();
		}
		case 'grep': {
			return (async function* (): Stream<ShellRecord> {
				const result = await runGrepCommand({
					context,
					fs,
					input,
					// @shfs/compiler can be consumed as a built package in this workspace,
					// so grep args may type as legacy argv until compiler is rebuilt.
					parsed: step.args as unknown as Parameters<
						typeof runGrepCommand
					>[0]['parsed'],
					redirections: step.redirections,
				});
				context.status = result.status;
				for (const text of result.lines) {
					yield {
						kind: 'line',
						text,
					};
				}
			})();
		}
		case 'head': {
			return (async function* (): Stream<ShellRecord> {
				const inputPath = getRedirectPath(step.redirections, 'input');
				const filePaths = withInputRedirect(
					resolvePathsFromCwd(
						context.cwd,
						await evaluateExpandedPathWords(
							'head',
							step.args.files,
							fs,
							context
						)
					),
					inputPath
				);
				if (filePaths.length > 0) {
					yield* headWithN(fs, step.args.n)(files(...filePaths));
					context.status = 0;
					return;
				}
				if (input) {
					yield* headLines(step.args.n)(toLineStream(fs, input));
				}
				context.status = 0;
			})();
		}
		case 'ls': {
			return (async function* (): Stream<ShellRecord> {
				const paths = await evaluateExpandedPathWords(
					'ls',
					step.args.paths,
					fs,
					context
				);
				for (const inputPath of paths) {
					const resolvedPath = await resolveLsPath(
						fs,
						inputPath,
						context.cwd
					);
					for await (const fileRecord of ls(fs, resolvedPath, {
						showAll: step.args.showAll,
					})) {
						if (step.args.longFormat) {
							const stat = await fs.stat(fileRecord.path);
							yield {
								kind: 'line',
								text: formatLongListing(fileRecord.path, stat),
							} as const;
							continue;
						}
						yield fileRecord;
					}
				}
				context.status = 0;
			})();
		}
		case 'tail': {
			return (async function* (): Stream<ShellRecord> {
				const inputPath = getRedirectPath(step.redirections, 'input');
				const filePaths = withInputRedirect(
					resolvePathsFromCwd(
						context.cwd,
						await evaluateExpandedPathWords(
							'tail',
							step.args.files,
							fs,
							context
						)
					),
					inputPath
				);
				if (filePaths.length > 0) {
					for (const filePath of filePaths) {
						yield* tail(step.args.n)(cat(fs)(files(filePath)));
					}
					context.status = 0;
					return;
				}
				if (input) {
					yield* tail(step.args.n)(toLineStream(fs, input));
				}
				context.status = 0;
			})();
		}
		case 'pwd': {
			return (async function* (): Stream<ShellRecord> {
				yield* pwd(context.cwd);
				context.status = 0;
			})();
		}
		case 'echo': {
			return echo(builtinRuntime, step.args);
		}
		case 'set': {
			return set(builtinRuntime, step.args);
		}
		case 'test': {
			return test(builtinRuntime, step.args);
		}
		case 'read': {
			return read(builtinRuntime, step.args);
		}
		case 'string': {
			return string(builtinRuntime, step.args);
		}
		default: {
			const _exhaustive: never = step;
			throw new Error(
				`Unknown command: ${String((_exhaustive as { cmd: string }).cmd)}`
			);
		}
	}
}

async function executeEffectStep(
	step: EffectStep,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<void> {
	const builtinRuntime = createBuiltinRuntime(fs, context, null);

	switch (step.cmd) {
		case 'cd': {
			await cd(builtinRuntime, step.args);
			break;
		}
		case 'cp': {
			const srcPaths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWords(
					'cp',
					step.args.srcs,
					fs,
					context
				)
			);
			const destinationPaths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWord(
					'cp',
					step.args.dest,
					fs,
					context
				)
			);
			if (destinationPaths.length !== 1) {
				throw new Error(
					`cp: destination must expand to exactly 1 path, got ${destinationPaths.length}`
				);
			}
			const destinationPath = destinationPaths.at(0);
			if (destinationPath === undefined) {
				throw new Error('cp: destination missing after expansion');
			}
			await cp(fs)({
				srcs: srcPaths,
				dest: destinationPath,
				force: step.args.force,
				interactive: step.args.interactive,
				recursive: step.args.recursive,
			});
			context.status = 0;
			break;
		}
		case 'mkdir': {
			const paths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWords(
					'mkdir',
					step.args.paths,
					fs,
					context
				)
			);
			for (const path of paths) {
				await mkdir(fs)({ path, recursive: step.args.recursive });
			}
			context.status = 0;
			break;
		}
		case 'mv': {
			const srcPaths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWords(
					'mv',
					step.args.srcs,
					fs,
					context
				)
			);
			const destinationPaths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWord(
					'mv',
					step.args.dest,
					fs,
					context
				)
			);
			if (destinationPaths.length !== 1) {
				throw new Error(
					`mv: destination must expand to exactly 1 path, got ${destinationPaths.length}`
				);
			}
			const destinationPath = destinationPaths.at(0);
			if (destinationPath === undefined) {
				throw new Error('mv: destination missing after expansion');
			}
			await mv(fs)({
				srcs: srcPaths,
				dest: destinationPath,
				force: step.args.force,
				interactive: step.args.interactive,
			});
			context.status = 0;
			break;
		}
		case 'rm': {
			const paths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWords(
					'rm',
					step.args.paths,
					fs,
					context
				)
			);
			for (const path of paths) {
				await rm(fs)({
					path,
					force: step.args.force,
					interactive: step.args.interactive,
					recursive: step.args.recursive,
				});
			}
			context.status = 0;
			break;
		}
		case 'touch': {
			const filePaths = resolvePathsFromCwd(
				context.cwd,
				await evaluateExpandedPathWords(
					'touch',
					step.args.files,
					fs,
					context
				)
			);
			await touch(fs)({
				files: filePaths,
				accessTimeOnly: step.args.accessTimeOnly,
				modificationTimeOnly: step.args.modificationTimeOnly,
			});
			context.status = 0;
			break;
		}
		default: {
			const _exhaustive: never = step;
			throw new Error(
				`Unknown command: ${String((_exhaustive as { cmd: string }).cmd)}`
			);
		}
	}
}

function createBuiltinRuntime(
	fs: FS,
	context: NormalizedExecuteContext,
	input: Stream<ShellRecord> | null
): BuiltinRuntime {
	return {
		fs,
		context,
		input,
	};
}

function formatLongListing(
	path: string,
	stat: Awaited<ReturnType<FS['stat']>>
): string {
	const mode = stat.isDirectory ? 'd' : '-';
	const size = String(stat.size).padStart(8, ' ');
	return `${mode} ${size} ${stat.mtime.toISOString()} ${path}`;
}

function normalizeLsPath(path: string, cwd: string): string {
	if (path === '.' || path === './') {
		return cwd;
	}
	if (path.startsWith('./')) {
		return `${cwd}/${path.slice(2)}`;
	}
	if (path.startsWith(ROOT_DIRECTORY)) {
		return path;
	}
	return `${cwd}/${path}`;
}

function trimTrailingSlash(path: string): string {
	if (path === ROOT_DIRECTORY) {
		return path;
	}
	return path.replace(TRAILING_SLASH_REGEX, '');
}

async function resolveLsPath(
	fs: FS,
	path: string,
	cwd: string
): Promise<string> {
	const normalizedPath = normalizeLsPath(path, cwd);
	if (GLOB_PATTERN_REGEX.test(normalizedPath)) {
		return normalizedPath;
	}

	try {
		const stat = await fs.stat(normalizedPath);
		if (!stat.isDirectory) {
			return normalizedPath;
		}
	} catch {
		return normalizedPath;
	}

	const directoryPath = trimTrailingSlash(normalizedPath);
	if (directoryPath === ROOT_DIRECTORY) {
		return '/*';
	}
	return `${directoryPath}/*`;
}

function normalizeContext(context: ExecuteContext): NormalizedExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	context.status ??= 0;
	context.globalVars ??= new Map<string, string>();
	context.localVars ??= new Map<string, string>();
	return context as NormalizedExecuteContext;
}
