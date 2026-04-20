import type {
	PipelineIR,
	ScriptIR,
	StatementChainModeIR,
	StepIR,
} from '@shfs/compiler';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import { normalizeCwd } from './path';
import {
	applyOutputRedirect,
	hasRedirect,
	type ExecuteResult as RedirectExecuteResult,
	resolveRedirectPath,
} from './redirection';
import { CommandRegistry, type ExecuteStepContext } from './registry';

export type { ExecuteResult } from './redirection';

export interface ExecuteContext {
	cwd: string;
	status?: number;
	stderr?: string[];
	globalVars?: Map<string, string>;
	localVars?: Map<string, string>;
}

type NormalizedExecuteContext = ExecuteStepContext;

interface StreamExecutionOptions {
	finalGrepOutputRedirectPath?: string;
}

const ROOT_DIRECTORY = '/';
const TEXT_ENCODER = new TextEncoder();

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
		CommandRegistry.isEffectStep(finalStep) ||
		hasRedirect(finalStep.redirections, 'output')
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

	if (CommandRegistry.isEffectStep(lastStep)) {
		for (const [index, step] of ir.steps.entries()) {
			if (
				CommandRegistry.isEffectStep(step) &&
				index !== ir.steps.length - 1
			) {
				throw new Error(
					`Unsupported pipeline: "${step.cmd}" must be the final command`
				);
			}
		}

		if (hasRedirect(lastStep.redirections, 'output')) {
			return {
				kind: 'sink',
				value: (async () => {
					const outputPath = await resolveRedirectPath(
						lastStep.cmd,
						lastStep.redirections,
						'output',
						fs,
						context
					);
					if (!outputPath) {
						throw new Error(
							`${lastStep.cmd}: output redirection missing target`
						);
					}
					await executePipelineToSink(ir.steps, fs, context);
					await fs.writeFile(outputPath, TEXT_ENCODER.encode(''));
				})(),
			};
		}

		return {
			kind: 'sink',
			value: executePipelineToSink(ir.steps, fs, context),
		};
	}

	if (
		lastStep.cmd === 'grep' &&
		hasRedirect(lastStep.redirections, 'output')
	) {
		return {
			kind: 'sink',
			value: (async () => {
				const outputPath = await resolveRedirectPath(
					lastStep.cmd,
					lastStep.redirections,
					'output',
					fs,
					context
				);
				if (!outputPath) {
					throw new Error(
						`${lastStep.cmd}: output redirection missing target`
					);
				}

				const redirectedResult = applyOutputRedirect(
					{
						kind: 'stream',
						value: executePipelineToStream(ir.steps, fs, context, {
							finalGrepOutputRedirectPath: outputPath,
						}),
					},
					lastStep,
					fs,
					context,
					outputPath
				);
				if (redirectedResult.kind !== 'sink') {
					throw new Error(
						`${lastStep.cmd}: output redirection did not produce a sink`
					);
				}
				await redirectedResult.value;
			})(),
		};
	}

	const stream = executePipelineToStream(ir.steps, fs, context);
	return applyOutputRedirect(
		{
			kind: 'stream',
			value: stream,
		},
		lastStep,
		fs,
		context
	);
}

function executePipelineToStream(
	steps: StepIR[],
	fs: FS,
	context: NormalizedExecuteContext,
	options: StreamExecutionOptions = {}
): Stream<ShellRecord> {
	return (async function* () {
		let stream: Stream<ShellRecord> | null = null;
		for (const [index, step] of steps.entries()) {
			if (CommandRegistry.isEffectStep(step)) {
				throw new Error(
					`Unsupported pipeline: "${step.cmd}" requires being the final command`
				);
			}
			stream = CommandRegistry.executeStep({
				step,
				fs,
				input: stream,
				context,
				resolvedOutputRedirectPath:
					index === steps.length - 1
						? options.finalGrepOutputRedirectPath
						: undefined,
			});
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
	if (!(finalStep && CommandRegistry.isEffectStep(finalStep))) {
		return;
	}

	if (steps.length > 1) {
		const stream = executePipelineToStream(steps.slice(0, -1), fs, context);
		for await (const _record of stream) {
			// drain
		}
	}

	await CommandRegistry.executeStep({
		step: finalStep,
		fs,
		context,
	});
}

function normalizeContext(context: ExecuteContext): NormalizedExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	context.status ??= 0;
	context.stderr ??= [];
	context.globalVars ??= new Map<string, string>();
	context.localVars ??= new Map<string, string>();
	return context as NormalizedExecuteContext;
}
