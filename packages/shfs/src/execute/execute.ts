import {
	expandedWordToString,
	type PipelineIR,
	type RedirectionIR,
	type ScriptIR,
	type StatementChainModeIR,
	type StepIR,
} from '@shfs/compiler';
import { Effect } from 'effect';
import {
	isShellDiagnosticError,
	isShellRuntimeError,
	ShellRuntimeError,
	writeDiagnosticsToStderr,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { formatRecord, type Record as ShellRecord } from '../record';
import { BufferedOutputStream, type OutputStream } from '../stderr';
import type { Stream } from '../stream';
import {
	evaluateExpandedSinglePathEffect,
	normalizeCwd,
	resolvePathFromCwd,
} from './path';
import {
	ensureNoclobberWritable,
	getRedirectionMode,
	hasRedirect,
	isNullDevicePath,
	type ExecuteResult as RedirectExecuteResult,
	writeTextToFile,
} from './redirection';
import {
	CommandRegistry,
	type EffectStep,
	type ExecuteStepContext,
} from './registry';

export type { ExecuteResult } from './redirection';

export interface ExecuteContext {
	cwd: string;
	status?: number;
	stderr?: OutputStream;
	globalVars?: Map<string, string>;
	localVars?: Map<string, string>;
}

type NormalizedExecuteContext = ExecuteStepContext;

type OutputDestination =
	| { kind: 'closed' }
	| { kind: 'nullDevice' }
	| { kind: 'pipe' }
	| { kind: 'shellStderr' }
	| { kind: 'shellStdout' }
	| {
			kind: 'file';
			append: boolean;
			noclobber: boolean;
			path: string;
	  };

interface StepRoutingPlan {
	fd1: OutputDestination;
	fd2: OutputDestination;
}

interface RoutedOutput {
	pipeRecords: ShellRecord[];
	shellRecords: ShellRecord[];
}

interface ExecutedStepResult extends RoutedOutput {
	preservedStatus: number | null;
}

type ExecutedStepOutcome =
	| { kind: 'failure'; error: unknown }
	| { kind: 'success'; result: ExecutedStepResult };

type RoutingPlanResult =
	| { kind: 'failure'; error: unknown }
	| { kind: 'success'; plan: StepRoutingPlan };

const ROOT_DIRECTORY = '/';
const FD_TARGET_REGEX = /^&[0-9]+$/;

async function* emptyStream<T>(): Stream<T> {
	// no records
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

export function execute(
	ir: PipelineIR | ScriptIR,
	fs: FS,
	context: ExecuteContext = { cwd: ROOT_DIRECTORY }
): RedirectExecuteResult {
	const normalizedContext = normalizeContext(context);
	const scriptIR = isScriptIR(ir) ? ir : toScriptIR(ir);
	return executeScript(scriptIR, fs, normalizedContext);
}

function isPipelineSink(pipeline: PipelineIR): boolean {
	if (hasMidPipelineStdoutBypass(pipeline.steps)) {
		return false;
	}
	const finalStep = pipeline.steps.at(-1);
	if (!finalStep) {
		return false;
	}
	return (
		CommandRegistry.isEffectStep(finalStep) ||
		hasRedirect(finalStep.redirections, 'output')
	);
}

function hasMidPipelineStdoutBypass(steps: StepIR[]): boolean {
	for (const [index, step] of steps.entries()) {
		if (index === steps.length - 1) {
			continue;
		}
		const redirections = step.redirections ?? [];
		const hasNonStdoutPipe = redirections.some((redirection) => {
			return (
				redirection.kind === 'output' &&
				getSourceFd(redirection) !== 1 &&
				getRedirectionMode(redirection) === 'pipe'
			);
		});
		if (!hasNonStdoutPipe) {
			continue;
		}
		const hasStdoutPipe = redirections.some((redirection) => {
			return (
				redirection.kind === 'output' &&
				getSourceFd(redirection) === 1 &&
				getRedirectionMode(redirection) === 'pipe'
			);
		});
		if (!hasStdoutPipe) {
			return true;
		}
	}
	return false;
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

		await drainStream(runPipeline(statement.pipeline, fs, context));
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

		const records = await collectRecords(
			runPipeline(statement.pipeline, fs, context)
		);
		yield* recordsToStream(records);
	}
}

async function drainStream(stream: Stream<ShellRecord>): Promise<void> {
	for await (const _record of stream) {
		// drain stream output to complete side effects.
	}
}

async function* runPipeline(
	pipeline: PipelineIR,
	fs: FS,
	context: NormalizedExecuteContext
): Stream<ShellRecord> {
	if (pipeline.steps.length === 0) {
		return;
	}

	let pipeInputRecords: ShellRecord[] | null = null;
	let preservedPipelineStatus: number | null = null;

	for (const [index, step] of pipeline.steps.entries()) {
		const isLastStep = index === pipeline.steps.length - 1;
		if (CommandRegistry.isEffectStep(step) && !isLastStep) {
			context.status = 1;
			context.stderr.append(
				`Unsupported pipeline: "${step.cmd}" must be the final command`
			);
			return;
		}

		const planResult: RoutingPlanResult = await Effect.runPromise(
			resolveRoutingPlanEffect(step, fs, context, isLastStep).pipe(
				Effect.match({
					onFailure: (error) => ({ kind: 'failure', error }) as const,
					onSuccess: (plan) => ({ kind: 'success', plan }) as const,
				})
			)
		);
		if (planResult.kind === 'failure') {
			recordExecutionFailure(planResult.error, context);
			return;
		}
		const plan = planResult.plan;
		const shouldPreserveStatus = shouldPreserveProducerStatus(
			plan,
			!isLastStep
		);
		if (!(await preflightNoclobber(plan, fs))) {
			context.status = 1;
			context.stderr.append(
				`${step.cmd}: cannot overwrite existing file`
			);
			return;
		}

		const executed: ExecutedStepOutcome = CommandRegistry.isEffectStep(step)
			? await executeEffectStep({
					context,
					fs,
					plan,
					shouldPreserveStatus,
					step,
				})
			: await executeStreamStep({
					context,
					fs,
					hasNextStep: !isLastStep,
					inputRecords: pipeInputRecords,
					plan,
					shouldPreserveStatus,
					step,
				});
		if (executed.kind === 'failure') {
			recordExecutionFailure(executed.error, context);
			return;
		}
		const stepResult: ExecutedStepResult = executed.result;
		if (stepResult.preservedStatus !== null) {
			preservedPipelineStatus = stepResult.preservedStatus;
		}
		if (stepResult.shellRecords.length > 0) {
			yield* recordsToStream(stepResult.shellRecords);
		}
		pipeInputRecords = stepResult.pipeRecords;
	}
	if (preservedPipelineStatus !== null) {
		context.status = preservedPipelineStatus;
	}
}

async function executeEffectStep(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	plan: StepRoutingPlan;
	shouldPreserveStatus: boolean;
	step: EffectStep;
}): Promise<ExecutedStepOutcome> {
	const { context, fs, plan, shouldPreserveStatus, step } = params;
	const childContext = createChildContext(context);
	const error = await Effect.runPromise(
		CommandRegistry.executeStep({
			step,
			fs,
			context: childContext,
		}).pipe(
			Effect.match({
				onFailure: (cause) => cause,
				onSuccess: () => null,
			})
		)
	);
	if (error !== null) {
		return { kind: 'failure', error };
	}
	propagateChildContext(childContext, context);
	const routed = await routeStepOutput({
		context,
		fs,
		hasNextStep: false,
		plan,
		stderrLines: childContext.stderr.snapshot(),
		stdoutRecords: [],
	});
	return {
		kind: 'success',
		result: {
			...routed,
			preservedStatus: shouldPreserveStatus ? childContext.status : null,
		},
	};
}

async function executeStreamStep(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	hasNextStep: boolean;
	inputRecords: ShellRecord[] | null;
	plan: StepRoutingPlan;
	shouldPreserveStatus: boolean;
	step: Exclude<StepIR, EffectStep>;
}): Promise<ExecutedStepOutcome> {
	const {
		context,
		fs,
		hasNextStep,
		inputRecords,
		plan,
		shouldPreserveStatus,
		step,
	} = params;
	const childContext = createChildContext(context);
	const resolvedOutputRedirectPath =
		step.cmd === 'grep' && plan.fd1.kind === 'file'
			? plan.fd1.path
			: undefined;
	const stepOutput = CommandRegistry.executeStep({
		step,
		fs,
		input: inputRecords === null ? null : recordsToStream(inputRecords),
		context: childContext,
		resolvedOutputRedirectPath,
	});
	const stdoutRecords = await collectRecords(stepOutput);
	const stderrLines = childContext.stderr.snapshot();
	propagateChildContext(childContext, context);
	const routed = await routeStepOutput({
		context,
		fs,
		hasNextStep,
		plan,
		stderrLines,
		stdoutRecords,
	});
	return {
		kind: 'success',
		result: {
			...routed,
			preservedStatus: shouldPreserveStatus ? childContext.status : null,
		},
	};
}

function normalizeContext(context: ExecuteContext): NormalizedExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	context.status ??= 0;
	context.stderr ??= new BufferedOutputStream();
	context.globalVars ??= new Map<string, string>();
	context.localVars ??= new Map<string, string>();
	return context as NormalizedExecuteContext;
}

function createChildContext(
	context: NormalizedExecuteContext
): NormalizedExecuteContext {
	return {
		cwd: context.cwd,
		globalVars: context.globalVars,
		localVars: context.localVars,
		status: context.status,
		stderr: new BufferedOutputStream(),
	};
}

function propagateChildContext(
	child: NormalizedExecuteContext,
	parent: NormalizedExecuteContext
): void {
	parent.cwd = child.cwd;
	parent.status = child.status;
}

async function collectRecords(
	stream: Stream<ShellRecord>
): Promise<ShellRecord[]> {
	const records: ShellRecord[] = [];
	for await (const record of stream) {
		records.push(record);
	}
	return records;
}

function recordsToStream(records: readonly ShellRecord[]): Stream<ShellRecord> {
	return (async function* (): Stream<ShellRecord> {
		for (const record of records) {
			yield record;
		}
	})();
}

function cloneDestination(destination: OutputDestination): OutputDestination {
	if (destination.kind !== 'file') {
		return destination;
	}
	return { ...destination };
}

function getSourceFd(redirection: RedirectionIR): number {
	return redirection.sourceFd ?? 1;
}

function getTargetFd(redirection: RedirectionIR): number | null {
	if (redirection.targetFd !== undefined && redirection.targetFd !== null) {
		return redirection.targetFd;
	}
	const targetText = expandedWordToString(redirection.target);
	if (!FD_TARGET_REGEX.test(targetText)) {
		return null;
	}
	return Number(targetText.slice(1));
}

function resolveFileDestinationEffect(
	command: string,
	redirection: RedirectionIR,
	fs: FS,
	context: NormalizedExecuteContext
): Effect.Effect<OutputDestination, unknown> {
	return Effect.gen(function* () {
		const targetPath = yield* evaluateExpandedSinglePathEffect(
			command,
			'redirection target must expand to exactly 1 path',
			redirection.target,
			fs,
			context
		);
		const resolvedPath = resolvePathFromCwd(context.cwd, targetPath);
		if (isNullDevicePath(resolvedPath)) {
			return { kind: 'nullDevice' };
		}
		return {
			kind: 'file',
			append: redirection.append ?? false,
			noclobber: redirection.noclobber ?? false,
			path: resolvedPath,
		};
	});
}

function destinationForFd(
	routing: StepRoutingPlan,
	fd: number,
	_isLastStep: boolean
): OutputDestination {
	if (fd === 1) {
		return routing.fd1;
	}
	if (fd === 2) {
		return routing.fd2;
	}
	return { kind: 'closed' };
}

function defaultStdoutDestination(
	isLastStep: boolean,
	hasNonStdoutPipeRedirect: boolean,
	hasStdoutPipeRedirect: boolean
): OutputDestination {
	if (isLastStep) {
		return { kind: 'shellStdout' };
	}
	if (hasNonStdoutPipeRedirect && !hasStdoutPipeRedirect) {
		return { kind: 'shellStdout' };
	}
	return { kind: 'pipe' };
}

function resolveOutputRedirectionDestinationEffect(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	isLastStep: boolean;
	redirection: RedirectionIR;
	routing: StepRoutingPlan;
	step: StepIR;
}): Effect.Effect<
	{ destination: OutputDestination; sourceFd: 1 | 2 } | null,
	unknown
> {
	return Effect.gen(function* () {
		const { context, fs, isLastStep, redirection, routing, step } = params;
		if (redirection.kind !== 'output') {
			return null;
		}
		const sourceFd = getSourceFd(redirection);
		if (sourceFd !== 1 && sourceFd !== 2) {
			return null;
		}

		const mode = getRedirectionMode(redirection);
		let destination: OutputDestination;
		if (mode === 'close') {
			destination = { kind: 'closed' };
		} else if (mode === 'pipe') {
			destination = { kind: 'pipe' };
		} else if (mode === 'fd') {
			const targetFd = getTargetFd(redirection);
			if (targetFd === null) {
				return yield* Effect.fail(
					new ShellRuntimeError({
						exitCode: 1,
						message: `${step.cmd}: invalid file descriptor duplication target`,
					})
				);
			}
			destination = cloneDestination(
				destinationForFd(routing, targetFd, isLastStep)
			);
		} else if (mode === 'file') {
			destination = yield* resolveFileDestinationEffect(
				step.cmd,
				redirection,
				fs,
				context
			);
		} else {
			destination = sourceFd === 1 ? routing.fd1 : routing.fd2;
		}

		return {
			destination,
			sourceFd,
		};
	});
}

function resolveRoutingPlanEffect(
	step: StepIR,
	fs: FS,
	context: NormalizedExecuteContext,
	isLastStep: boolean
): Effect.Effect<StepRoutingPlan, unknown> {
	return Effect.gen(function* () {
		const stepRedirections = step.redirections ?? [];
		const hasNonStdoutPipeRedirect = stepRedirections.some(
			(redirection) => {
				return (
					redirection.kind === 'output' &&
					getSourceFd(redirection) !== 1 &&
					getRedirectionMode(redirection) === 'pipe'
				);
			}
		);
		const hasStdoutPipeRedirect = stepRedirections.some((redirection) => {
			return (
				redirection.kind === 'output' &&
				getSourceFd(redirection) === 1 &&
				getRedirectionMode(redirection) === 'pipe'
			);
		});
		const routing: StepRoutingPlan = {
			fd1: defaultStdoutDestination(
				isLastStep,
				hasNonStdoutPipeRedirect,
				hasStdoutPipeRedirect
			),
			fd2: { kind: 'shellStderr' },
		};

		for (const redirection of stepRedirections) {
			const resolved = yield* resolveOutputRedirectionDestinationEffect({
				context,
				fs,
				isLastStep,
				redirection,
				routing,
				step,
			});
			if (!resolved) {
				continue;
			}
			if (resolved.sourceFd === 1) {
				routing.fd1 = resolved.destination;
				continue;
			}
			routing.fd2 = resolved.destination;
		}

		return routing;
	});
}

async function preflightNoclobber(
	plan: StepRoutingPlan,
	fs: FS
): Promise<boolean> {
	const destinations = [plan.fd1, plan.fd2];
	const checkedPaths = new Set<string>();
	for (const destination of destinations) {
		if (destination.kind !== 'file' || !destination.noclobber) {
			continue;
		}
		if (checkedPaths.has(destination.path)) {
			continue;
		}
		checkedPaths.add(destination.path);
		if (!(await ensureNoclobberWritable(fs, destination.path))) {
			return false;
		}
	}
	return true;
}

function stderrLinesToRecords(lines: readonly string[]): ShellRecord[] {
	return lines.map((text) => ({
		kind: 'line',
		text,
	}));
}

function recordsToText(records: readonly ShellRecord[]): string {
	return records.map((record) => formatRecord(record)).join('\n');
}

function linesToText(lines: readonly string[]): string {
	return lines.join('\n');
}

function mergeChannelText(stdoutText: string, stderrText: string): string {
	if (stdoutText === '') {
		return stderrText;
	}
	if (stderrText === '') {
		return stdoutText;
	}
	return `${stdoutText}\n${stderrText}`;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function recordExecutionFailure(
	error: unknown,
	context: NormalizedExecuteContext
): void {
	if (isShellDiagnosticError(error)) {
		context.status = error.exitCode;
		writeDiagnosticsToStderr(context, error.diagnostics);
		return;
	}
	if (isShellRuntimeError(error)) {
		context.status = error.exitCode;
		if (error.message !== '') {
			context.stderr.append(error.message);
		}
		return;
	}
	context.status = 1;
	context.stderr.append(toErrorMessage(error));
}

async function writeToFileOrReport(params: {
	append: boolean;
	content: string;
	context: NormalizedExecuteContext;
	fs: FS;
	path: string;
}): Promise<void> {
	const { append, content, context, fs, path } = params;
	const error = await Effect.runPromise(
		Effect.tryPromise({
			try: () => writeTextToFile(fs, path, content, { append }),
			catch: (cause) => cause,
		}).pipe(
			Effect.match({
				onFailure: (cause) => cause,
				onSuccess: () => null,
			})
		)
	);
	if (error !== null) {
		context.status = 1;
		context.stderr.append(toErrorMessage(error));
	}
}

function shouldPipe(
	destination: OutputDestination,
	hasNextStep: boolean
): boolean {
	return destination.kind === 'pipe' && hasNextStep;
}

function shouldPreserveProducerStatus(
	plan: StepRoutingPlan,
	hasNextStep: boolean
): boolean {
	return hasNextStep && plan.fd2.kind === 'pipe' && plan.fd1.kind !== 'pipe';
}

async function routeStepOutput(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	hasNextStep: boolean;
	plan: StepRoutingPlan;
	stderrLines: readonly string[];
	stdoutRecords: readonly ShellRecord[];
}): Promise<RoutedOutput> {
	const { context, fs, hasNextStep, plan, stderrLines, stdoutRecords } =
		params;

	const pipeRecords: ShellRecord[] = [];
	const shellRecords: ShellRecord[] = [];

	const stdoutDestination = plan.fd1;
	const stderrDestination = plan.fd2;

	const writesToSameFile =
		stdoutDestination.kind === 'file' &&
		stderrDestination.kind === 'file' &&
		stdoutDestination.path === stderrDestination.path;
	if (writesToSameFile) {
		const mergedText = mergeChannelText(
			recordsToText(stdoutRecords),
			linesToText(stderrLines)
		);
		await writeToFileOrReport({
			append: stdoutDestination.append && stderrDestination.append,
			content: mergedText,
			context,
			fs,
			path: stdoutDestination.path,
		});
	} else {
		await routeStdout(
			stdoutRecords,
			stdoutDestination,
			hasNextStep,
			pipeRecords,
			shellRecords,
			context,
			fs
		);
		await routeStderr(
			stderrLines,
			stderrDestination,
			hasNextStep,
			pipeRecords,
			shellRecords,
			context,
			fs
		);
	}

	return {
		pipeRecords,
		shellRecords,
	};
}

async function routeStdout(
	stdoutRecords: readonly ShellRecord[],
	destination: OutputDestination,
	hasNextStep: boolean,
	pipeRecords: ShellRecord[],
	shellRecords: ShellRecord[],
	context: NormalizedExecuteContext,
	fs: FS
): Promise<void> {
	if (stdoutRecords.length === 0 && destination.kind !== 'file') {
		return;
	}

	if (shouldPipe(destination, hasNextStep)) {
		pipeRecords.push(...stdoutRecords);
		return;
	}

	switch (destination.kind) {
		case 'shellStdout':
			shellRecords.push(...stdoutRecords);
			return;
		case 'pipe':
			shellRecords.push(...stdoutRecords);
			return;
		case 'shellStderr': {
			const stdoutText = recordsToText(stdoutRecords);
			if (stdoutText !== '') {
				context.stderr.append(stdoutText);
			}
			return;
		}
		case 'file':
			await writeToFileOrReport({
				append: destination.append,
				content: recordsToText(stdoutRecords),
				context,
				fs,
				path: destination.path,
			});
			return;
		case 'closed':
			return;
		case 'nullDevice':
			return;
		default: {
			const _exhaustive: never = destination;
			throw new Error(`Unknown stdout destination: ${_exhaustive}`);
		}
	}
}

async function routeStderr(
	stderrLines: readonly string[],
	destination: OutputDestination,
	hasNextStep: boolean,
	pipeRecords: ShellRecord[],
	shellRecords: ShellRecord[],
	context: NormalizedExecuteContext,
	fs: FS
): Promise<void> {
	if (stderrLines.length === 0 && destination.kind !== 'file') {
		return;
	}

	if (shouldPipe(destination, hasNextStep)) {
		pipeRecords.push(...stderrLinesToRecords(stderrLines));
		return;
	}

	switch (destination.kind) {
		case 'shellStdout':
			shellRecords.push(...stderrLinesToRecords(stderrLines));
			return;
		case 'pipe':
			shellRecords.push(...stderrLinesToRecords(stderrLines));
			return;
		case 'shellStderr':
			if (stderrLines.length > 0) {
				context.stderr.appendLines(stderrLines);
			}
			return;
		case 'file':
			await writeToFileOrReport({
				append: destination.append,
				content: linesToText(stderrLines),
				context,
				fs,
				path: destination.path,
			});
			return;
		case 'closed':
			return;
		case 'nullDevice':
			return;
		default: {
			const _exhaustive: never = destination;
			throw new Error(`Unknown stderr destination: ${_exhaustive}`);
		}
	}
}
