import {
	type AssignmentIR,
	expandedWordToString,
	type PipelineIR,
	type RedirectionIR,
	type ScriptIR,
	type StatementChainModeIR,
	type StatementIR,
	type StepIR,
} from '@shfs/compiler';
import { Result } from 'better-result';
import type { FunctionDefinition, VariableFrame } from '../builtin/types';
import {
	runOrReport,
	type ShellErrorCause,
	type ShellResult,
	ShellRuntimeError,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { recordsToBytes, type Record as ShellRecord } from '../record';
import {
	BufferedOutputStream,
	type OutputStream,
	type OutputStreamSnapshot,
} from '../stderr';
import type { Stream } from '../stream';
import { createShellInput, type ShellInput } from './io';
import {
	evaluateExpandedSinglePathEffect,
	expandWordToValuesEffect,
	normalizeCwd,
	resolvePathFromCwd,
} from './path';
import {
	collectRecordStream,
	fromRecordGenerator,
	type RecordStream,
} from './record-stream';
import {
	ensureNoclobberWritable,
	getRedirectionMode,
	isNullDevicePath,
	writeBytesToFile,
} from './redirection';
import {
	type ActionStep,
	CommandRegistry,
	type ExecuteStepContext,
} from './registry';
import { isReadOnlyVariable, lookupVariable } from './variables';

export interface ExecuteContext {
	cwd: string;
	status?: number;
	stderr?: OutputStream;
	globalVars?: Map<string, string[]>;
	stdin?: ShellInput;
	scopes?: VariableFrame[];
	functions?: Map<string, FunctionDefinition>;
}

type NormalizedExecuteContext = ExecuteStepContext;

/**
 * Loop and function control flow signal propagated through statement
 * execution. `break`/`continue` are consumed by the innermost loop body;
 * `return` is consumed by the function call (or ends the script).
 */
type ControlSignal =
	| { kind: 'normal' }
	| { kind: 'break' }
	| { kind: 'continue' }
	| { kind: 'return' };

const NORMAL_SIGNAL: ControlSignal = { kind: 'normal' };

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

const ROOT_DIRECTORY = '/';
const FD_TARGET_REGEX = /^&[0-9]+$/;
const NEWLINE_BYTE = 0x0a;

function isScriptIR(ir: PipelineIR | ScriptIR): ir is ScriptIR {
	return 'statements' in ir;
}

function toScriptIR(pipeline: PipelineIR): ScriptIR {
	return {
		statements: [
			{
				chainMode: 'always',
				kind: 'job',
				negated: false,
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
): RecordStream {
	const normalizedContext = normalizeContext(context);
	const scriptIR = isScriptIR(ir) ? ir : toScriptIR(ir);
	return executeScript(scriptIR, fs, normalizedContext);
}

function executeScript(
	script: ScriptIR,
	fs: FS,
	context: NormalizedExecuteContext
): RecordStream {
	return fromRecordGenerator(runScriptToStream(script, fs, context));
}

async function* runScriptToStream(
	script: ScriptIR,
	fs: FS,
	context: NormalizedExecuteContext
): Stream<ShellRecord> {
	const signal = yield* runStatementList(script.statements, fs, context);
	if (signal.kind === 'break' || signal.kind === 'continue') {
		context.status = 1;
		context.stderr.append(`${signal.kind}: Not inside of loop`);
	}
}

/**
 * Run a statement list, yielding records and returning the control signal
 * that ended it (`normal` when the list ran to completion).
 */
async function* runStatementList(
	statements: readonly StatementIR[],
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	for (const statement of statements) {
		if (!shouldExecuteStatement(statement.chainMode, context.status)) {
			continue;
		}
		const signal = yield* runStatement(statement, fs, context);
		if (signal.kind !== 'normal') {
			return signal;
		}
	}
	return NORMAL_SIGNAL;
}

async function* runStatement(
	statement: StatementIR,
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	switch (statement.kind) {
		case 'job': {
			const records = await collectRecords(
				runPipeline(statement.pipeline, fs, context)
			);
			yield* recordsToStream(records);
			if (statement.negated) {
				context.status = context.status === 0 ? 1 : 0;
			}
			return NORMAL_SIGNAL;
		}
		case 'begin':
			return yield* runBeginStatement(statement, fs, context);
		case 'if':
			return yield* runIfStatement(statement, fs, context);
		case 'while':
			return yield* runWhileStatement(statement, fs, context);
		case 'for':
			return yield* runForStatement(statement, fs, context);
		case 'function':
			runFunctionDefinition(statement, context);
			return NORMAL_SIGNAL;
		case 'break':
			return { kind: 'break' };
		case 'continue':
			return { kind: 'continue' };
		case 'return':
			return await runReturnStatement(statement, fs, context);
		default: {
			const _exhaustive: never = statement;
			throw new Error(
				`Unknown statement kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}

/**
 * Evaluate command-scoped assignments into a variable frame.
 * PATH-like names split their values on colons.
 */
function assignmentFrameEffect(
	assignments: readonly AssignmentIR[],
	fs: FS,
	context: NormalizedExecuteContext
): ShellResult<VariableFrame, ShellErrorCause> {
	return Result.gen(async function* () {
		const vars = new Map<string, string[]>();
		for (const assignment of assignments) {
			if (isReadOnlyVariable(assignment.name)) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `${assignment.name}: cannot overwrite read-only variable`,
				});
			}
			let values = yield* await expandWordToValuesEffect(
				assignment.value,
				fs,
				context,
				{ command: assignment.name, emptyGlobOk: true }
			);
			if (assignment.name.endsWith('PATH')) {
				values = values.flatMap((value) => value.split(':'));
			}
			vars.set(assignment.name, values);
		}
		return Result.ok({ vars });
	});
}

/**
 * Push an evaluated assignment frame. Returns false when evaluation
 * failed (already reported); the caller should skip the statement.
 */
async function pushAssignmentFrame(
	assignments: readonly AssignmentIR[],
	fs: FS,
	context: NormalizedExecuteContext
): Promise<boolean> {
	if (assignments.length === 0) {
		context.scopes.push({ vars: new Map() });
		return true;
	}
	const frame = await runOrReport(
		assignmentFrameEffect(assignments, fs, context),
		context
	);
	if (!frame.ok) {
		return false;
	}
	context.scopes.push(frame.value);
	return true;
}

async function* runBeginStatement(
	statement: Extract<StatementIR, { kind: 'begin' }>,
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	if (!(await pushAssignmentFrame(statement.assignments, fs, context))) {
		return NORMAL_SIGNAL;
	}
	context.scopes.push({ vars: new Map() });
	try {
		const signal = yield* runStatementList(statement.body, fs, context);
		if (signal.kind === 'normal' && statement.negated) {
			context.status = context.status === 0 ? 1 : 0;
		}
		return signal;
	} finally {
		context.scopes.pop();
		context.scopes.pop();
	}
}

async function* runIfStatement(
	statement: Extract<StatementIR, { kind: 'if' }>,
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	if (!(await pushAssignmentFrame(statement.assignments, fs, context))) {
		return NORMAL_SIGNAL;
	}
	try {
		let branchTaken = false;
		let signal: ControlSignal = NORMAL_SIGNAL;

		for (const branch of statement.branches) {
			const conditionSignal = yield* runStatementList(
				branch.condition,
				fs,
				context
			);
			if (conditionSignal.kind !== 'normal') {
				return conditionSignal;
			}
			if (context.status !== 0) {
				continue;
			}
			branchTaken = true;
			signal = yield* runBlockBody(branch.body, fs, context);
			break;
		}

		if (!branchTaken && statement.elseBody) {
			branchTaken = true;
			signal = yield* runBlockBody(statement.elseBody, fs, context);
		}
		if (!branchTaken) {
			context.status = 0;
		}
		if (signal.kind === 'normal' && statement.negated) {
			context.status = context.status === 0 ? 1 : 0;
		}
		return signal;
	} finally {
		context.scopes.pop();
	}
}

async function* runWhileStatement(
	statement: Extract<StatementIR, { kind: 'while' }>,
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	if (!(await pushAssignmentFrame(statement.assignments, fs, context))) {
		return NORMAL_SIGNAL;
	}
	try {
		let lastBodyStatus = 0;
		while (true) {
			// Loop-control signals in the condition target the outer loop.
			const conditionSignal = yield* runStatementList(
				statement.condition,
				fs,
				context
			);
			if (conditionSignal.kind !== 'normal') {
				return conditionSignal;
			}
			if (context.status !== 0) {
				break;
			}

			const signal = yield* runBlockBody(statement.body, fs, context);
			lastBodyStatus = context.status;
			if (signal.kind === 'break') {
				break;
			}
			if (signal.kind === 'return') {
				return signal;
			}
		}
		context.status = lastBodyStatus;
		if (statement.negated) {
			context.status = context.status === 0 ? 1 : 0;
		}
		return NORMAL_SIGNAL;
	} finally {
		context.scopes.pop();
	}
}

async function* runForStatement(
	statement: Extract<StatementIR, { kind: 'for' }>,
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	if (isReadOnlyVariable(statement.variable)) {
		context.status = 1;
		context.stderr.append(
			`for: ${statement.variable}: cannot overwrite read-only variable`
		);
		return NORMAL_SIGNAL;
	}

	const values: string[] = [];
	for (const word of statement.values) {
		const expanded = await runOrReport(
			expandWordToValuesEffect(word, fs, context, {
				command: 'for',
				emptyGlobOk: true,
			}),
			context
		);
		if (!expanded.ok) {
			return NORMAL_SIGNAL;
		}
		values.push(...expanded.value);
	}

	// The loop variable lives in the enclosing scope, initialized with any
	// previously visible value.
	const loopFrame = context.scopes.at(-1);
	if (!loopFrame) {
		throw new Error('Variable scope stack is empty');
	}
	loopFrame.vars.set(
		statement.variable,
		lookupVariable(context, statement.variable) ?? []
	);

	let lastBodyStatus = 0;
	for (const value of values) {
		loopFrame.vars.set(statement.variable, [value]);
		const signal = yield* runBlockBody(statement.body, fs, context);
		lastBodyStatus = context.status;
		if (signal.kind === 'break') {
			break;
		}
		if (signal.kind === 'return') {
			return signal;
		}
	}
	context.status = lastBodyStatus;
	return NORMAL_SIGNAL;
}

/**
 * Run a block body inside a fresh local scope frame.
 */
async function* runBlockBody(
	body: readonly StatementIR[],
	fs: FS,
	context: NormalizedExecuteContext
): AsyncGenerator<ShellRecord, ControlSignal> {
	context.scopes.push({ vars: new Map() });
	try {
		return yield* runStatementList(body, fs, context);
	} finally {
		context.scopes.pop();
	}
}

const RESERVED_FUNCTION_NAMES = new Set([
	'!',
	'and',
	'begin',
	'break',
	'case',
	'continue',
	'else',
	'end',
	'for',
	'function',
	'if',
	'in',
	'not',
	'or',
	'return',
	'switch',
	'while',
]);

function runFunctionDefinition(
	statement: Extract<StatementIR, { kind: 'function' }>,
	context: NormalizedExecuteContext
): void {
	if (
		RESERVED_FUNCTION_NAMES.has(statement.name) ||
		CommandRegistry.has(statement.name)
	) {
		context.status = 1;
		context.stderr.append(
			`function: ${statement.name}: cannot use reserved keyword as function name`
		);
		return;
	}
	context.functions.set(statement.name, {
		argumentNames: statement.argumentNames,
		body: statement.body,
		name: statement.name,
	});
	context.status = 0;
}

const RETURN_STATUS_REGEX = /^-?\d+$/;
const RETURN_STATUS_MODULO = 256;

async function runReturnStatement(
	statement: Extract<StatementIR, { kind: 'return' }>,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<ControlSignal> {
	const values: string[] = [];
	for (const word of statement.values) {
		const expanded = await runOrReport(
			expandWordToValuesEffect(word, fs, context, { command: 'return' }),
			context
		);
		if (!expanded.ok) {
			return NORMAL_SIGNAL;
		}
		values.push(...expanded.value);
	}

	if (values.length > 1) {
		context.status = 2;
		context.stderr.append('return: too many arguments');
		return { kind: 'return' };
	}
	const value = values.at(0);
	if (value !== undefined) {
		if (!RETURN_STATUS_REGEX.test(value)) {
			context.status = 2;
			context.stderr.append(`return: ${value}: invalid integer`);
			return { kind: 'return' };
		}
		const parsed = Number.parseInt(value, 10);
		if (parsed > RETURN_STATUS_MODULO - 1) {
			// Fish clamps out-of-range statuses to 255 (tests/checks/basic.fish).
			context.status = RETURN_STATUS_MODULO - 1;
			return { kind: 'return' };
		}
		const wrapped =
			((parsed % RETURN_STATUS_MODULO) + RETURN_STATUS_MODULO) %
			RETURN_STATUS_MODULO;
		// Fish semantics: a negative return never maps to success
		// (tests/checks/return.fish); multiples of -256 become 255.
		context.status = parsed < 0 && wrapped === 0 ? 255 : wrapped;
	}
	return { kind: 'return' };
}

/**
 * Invoke a runtime-defined function: arguments bind to $argv (and any
 * named arguments) in a barrier frame that hides caller locals.
 */
export async function* runFunctionCall(
	definition: FunctionDefinition,
	args: readonly string[],
	fs: FS,
	context: NormalizedExecuteContext,
	input: Stream<ShellRecord> | null = null,
	vars?: ReadonlyMap<string, string[]>,
	sharedInput?: ShellInput
): AsyncGenerator<ShellRecord, void> {
	const local = new Map<string, string[]>();
	for (const [name, values] of vars ?? []) {
		local.set(name, [...values]);
	}
	local.set('argv', [...args]);
	definition.argumentNames.forEach((name, index) => {
		const value = args[index];
		local.set(name, value === undefined ? [] : [value]);
	});
	const stdin = context.stdin;
	context.stdin = input
		? (sharedInput ?? createShellInput(input))
		: undefined;
	context.scopes.push({ barrier: true, vars: local });
	try {
		// Fish semantics: the body sees the caller's $status, but a function
		// that executes nothing returns 0 instead of preserving it
		// (tests/checks/empty.fish).
		if (definition.body.length === 0) {
			context.status = 0;
			return;
		}
		const signal = yield* runStatementList(definition.body, fs, context);
		if (signal.kind === 'break' || signal.kind === 'continue') {
			context.status = 1;
			context.stderr.append(`${signal.kind}: Not inside of loop`);
		}
	} finally {
		context.scopes.pop();
		context.stdin = stdin;
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
		if (CommandRegistry.isActionStep(step) && !isLastStep) {
			context.status = 1;
			context.stderr.append(
				`Unsupported pipeline: "${step.cmd}" must be the final command`
			);
			return;
		}

		const resolvedPlan = await runOrReport(
			resolveRoutingPlanEffect(step, fs, context, isLastStep),
			context
		);
		if (!resolvedPlan.ok) {
			return;
		}
		const plan = resolvedPlan.value;
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

		const stepResult: ExecutedStepResult | null =
			CommandRegistry.isActionStep(step)
				? await executeActionStep({
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
		if (stepResult === null) {
			return;
		}
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

async function executeActionStep(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	plan: StepRoutingPlan;
	shouldPreserveStatus: boolean;
	step: ActionStep;
}): Promise<ExecutedStepResult | null> {
	const { context, fs, plan, shouldPreserveStatus, step } = params;
	const childContext = createChildContext(context);
	const stepAssignments = step.assignments ?? [];
	const framePushed =
		stepAssignments.length > 0 &&
		(await pushAssignmentFrame(stepAssignments, fs, childContext));
	try {
		if (stepAssignments.length === 0 || framePushed) {
			await runOrReport(
				CommandRegistry.executeStep({
					step,
					fs,
					context: childContext,
				}),
				childContext
			);
		}
	} finally {
		if (framePushed) {
			childContext.scopes.pop();
		}
	}
	const stderrOutput = childContext.stderr.snapshotOutput();
	propagateChildContext(childContext, context);
	const routed = await routeStepOutput({
		context,
		fs,
		hasNextStep: false,
		plan,
		stderrOutput,
		stdoutRecords: [],
	});
	return {
		...routed,
		preservedStatus: shouldPreserveStatus ? childContext.status : null,
	};
}

async function executeStreamStep(params: {
	context: NormalizedExecuteContext;
	fs: FS;
	hasNextStep: boolean;
	inputRecords: ShellRecord[] | null;
	plan: StepRoutingPlan;
	shouldPreserveStatus: boolean;
	step: Exclude<StepIR, ActionStep>;
}): Promise<ExecutedStepResult | null> {
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
	const stepAssignments = step.assignments ?? [];
	const framePushed =
		stepAssignments.length > 0 &&
		(await pushAssignmentFrame(stepAssignments, fs, childContext));
	let stdoutRecords: ShellRecord[] = [];
	try {
		if (stepAssignments.length === 0 || framePushed) {
			const sharedInput =
				inputRecords === null ? childContext.stdin : undefined;
			const stepOutput = CommandRegistry.executeStep({
				step,
				fs,
				input:
					inputRecords === null
						? (sharedInput?.records() ?? null)
						: recordsToStream(inputRecords),
				sharedInput,
				context: childContext,
				resolvedOutputRedirectPath,
				vars: framePushed
					? childContext.scopes.at(-1)?.vars
					: undefined,
			});
			const collected = await runOrReport(
				collectRecordStream(stepOutput),
				childContext
			);
			stdoutRecords = collected.ok ? collected.value : [];
		}
	} finally {
		if (framePushed) {
			childContext.scopes.pop();
		}
	}
	const stderrOutput = childContext.stderr.snapshotOutput();
	propagateChildContext(childContext, context);
	const routed = await routeStepOutput({
		context,
		fs,
		hasNextStep,
		plan,
		stderrOutput,
		stdoutRecords,
	});
	return {
		...routed,
		preservedStatus: shouldPreserveStatus ? childContext.status : null,
	};
}

function normalizeContext(context: ExecuteContext): NormalizedExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	context.status ??= 0;
	context.stderr ??= new BufferedOutputStream();
	context.globalVars ??= new Map<string, string[]>();
	context.scopes ??= [{ vars: new Map<string, string[]>() }];
	if (context.scopes.length === 0) {
		context.scopes.push({ vars: new Map<string, string[]>() });
	}
	context.functions ??= new Map<string, FunctionDefinition>();
	return context as NormalizedExecuteContext;
}

function createChildContext(
	context: NormalizedExecuteContext
): NormalizedExecuteContext {
	return {
		cwd: context.cwd,
		functions: context.functions,
		globalVars: context.globalVars,
		scopes: context.scopes,
		status: context.status,
		stderr: new BufferedOutputStream(),
		stdin: context.stdin,
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
): ShellResult<OutputDestination, ShellErrorCause> {
	return Result.gen(async function* () {
		const targetPath = yield* await evaluateExpandedSinglePathEffect(
			command,
			'redirection target must expand to exactly 1 path',
			redirection.target,
			fs,
			context
		);
		const resolvedPath = resolvePathFromCwd(context.cwd, targetPath);
		if (isNullDevicePath(resolvedPath)) {
			return Result.ok<OutputDestination>({ kind: 'nullDevice' });
		}
		return Result.ok<OutputDestination>({
			kind: 'file',
			append: redirection.append ?? false,
			noclobber: redirection.noclobber ?? false,
			path: resolvedPath,
		});
	});
}

function destinationForFd(
	routing: StepRoutingPlan,
	fd: number
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
	redirection: RedirectionIR;
	routing: StepRoutingPlan;
	step: StepIR;
}): ShellResult<
	{ destination: OutputDestination; sourceFd: 1 | 2 } | null,
	ShellErrorCause
> {
	return Result.gen(async function* () {
		const { context, fs, redirection, routing, step } = params;
		if (redirection.kind !== 'output') {
			return Result.ok(null);
		}
		const sourceFd = getSourceFd(redirection);
		if (sourceFd !== 1 && sourceFd !== 2) {
			return Result.ok(null);
		}
		const outputSourceFd: 1 | 2 = sourceFd;

		const mode = getRedirectionMode(redirection);
		let destination: OutputDestination;
		if (mode === 'close') {
			destination = { kind: 'closed' };
		} else if (mode === 'pipe') {
			destination = { kind: 'pipe' };
		} else if (mode === 'fd') {
			const targetFd = getTargetFd(redirection);
			if (targetFd === null) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `${step.cmd}: invalid file descriptor duplication target`,
				});
			}
			destination = cloneDestination(destinationForFd(routing, targetFd));
		} else if (mode === 'file') {
			destination = yield* await resolveFileDestinationEffect(
				step.cmd,
				redirection,
				fs,
				context
			);
		} else {
			destination = sourceFd === 1 ? routing.fd1 : routing.fd2;
		}

		return Result.ok({
			destination,
			sourceFd: outputSourceFd,
		});
	});
}

function resolveRoutingPlanEffect(
	step: StepIR,
	fs: FS,
	context: NormalizedExecuteContext,
	isLastStep: boolean
): ShellResult<StepRoutingPlan, ShellErrorCause> {
	return Result.gen(async function* () {
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
			const resolved =
				yield* await resolveOutputRedirectionDestinationEffect({
					context,
					fs,
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

		return Result.ok(routing);
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

function stderrOutputToRecords(output: OutputStreamSnapshot): ShellRecord[] {
	const records: ShellRecord[] = [];
	if (output.bytes.length > 0) {
		records.push({ bytes: output.bytes, kind: 'bytes' });
	}
	if (output.needsLineSeparator) {
		records.push({ kind: 'line', text: '' });
	}
	return records;
}

function recordsToFileBytes(records: readonly ShellRecord[]): Uint8Array {
	return recordsToBytes(records, { trailingNewline: true });
}

function concatenateBytes(
	first: Uint8Array,
	second: Uint8Array,
	separator: Uint8Array = new Uint8Array()
): Uint8Array {
	const bytes = new Uint8Array(
		first.length + separator.length + second.length
	);
	bytes.set(first);
	bytes.set(separator, first.length);
	bytes.set(second, first.length + separator.length);
	return bytes;
}

function mergeChannelBytes(
	stdoutBytes: Uint8Array,
	stderrBytes: Uint8Array
): Uint8Array {
	if (stdoutBytes.length === 0) {
		return stderrBytes;
	}
	if (stderrBytes.length === 0) {
		return stdoutBytes;
	}
	if (stdoutBytes.at(-1) === NEWLINE_BYTE) {
		return concatenateBytes(stdoutBytes, stderrBytes);
	}
	return concatenateBytes(
		stdoutBytes,
		stderrBytes,
		new Uint8Array([NEWLINE_BYTE])
	);
}

async function writeToFileOrReport(params: {
	append: boolean;
	content: Uint8Array;
	context: NormalizedExecuteContext;
	fs: FS;
	path: string;
}): Promise<void> {
	const { append, content, context, fs, path } = params;
	try {
		await writeBytesToFile(fs, path, content, { append });
	} catch (error) {
		context.status = 1;
		context.stderr.append(
			error instanceof Error ? error.message : String(error)
		);
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
	stderrOutput: OutputStreamSnapshot;
	stdoutRecords: readonly ShellRecord[];
}): Promise<RoutedOutput> {
	const { context, fs, hasNextStep, plan, stderrOutput, stdoutRecords } =
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
		const mergedBytes = mergeChannelBytes(
			recordsToFileBytes(stdoutRecords),
			stderrOutput.bytes
		);
		await writeToFileOrReport({
			append: stdoutDestination.append && stderrDestination.append,
			content: mergedBytes,
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
			stderrOutput,
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

function clearExplicitSeparation(record: ShellRecord): ShellRecord {
	if (record.kind !== 'line' || record.separation !== 'explicit') {
		return record;
	}
	const downstreamRecord = { ...record };
	downstreamRecord.separation = undefined;
	return downstreamRecord;
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
		pipeRecords.push(...stdoutRecords.map(clearExplicitSeparation));
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
			context.stderr.appendBytes(recordsToFileBytes(stdoutRecords));
			return;
		}
		case 'file':
			await writeToFileOrReport({
				append: destination.append,
				content: recordsToFileBytes(stdoutRecords),
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
	stderrOutput: OutputStreamSnapshot,
	destination: OutputDestination,
	hasNextStep: boolean,
	pipeRecords: ShellRecord[],
	shellRecords: ShellRecord[],
	context: NormalizedExecuteContext,
	fs: FS
): Promise<void> {
	if (!stderrOutput.hasOutput && destination.kind !== 'file') {
		return;
	}

	if (shouldPipe(destination, hasNextStep)) {
		pipeRecords.push(...stderrOutputToRecords(stderrOutput));
		return;
	}

	switch (destination.kind) {
		case 'shellStdout':
			shellRecords.push(...stderrOutputToRecords(stderrOutput));
			return;
		case 'pipe':
			shellRecords.push(...stderrOutputToRecords(stderrOutput));
			return;
		case 'shellStderr':
			context.stderr.appendSnapshot(stderrOutput);
			return;
		case 'file':
			await writeToFileOrReport({
				append: destination.append,
				content: stderrOutput.bytes,
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
