import {
	compile,
	type ExpandedWord,
	expandedWordToString,
	type PipelineIR,
	parse,
	type RedirectionIR,
	type ScriptIR,
	type StatementChainModeIR,
	type StepIR,
} from '@shfs/compiler';
import picomatch from 'picomatch';
import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { headLines, headWithN } from '../operator/head/head';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { mv } from '../operator/mv/mv';
import { pwd } from '../operator/pwd/pwd';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import { touch } from '../operator/touch/touch';
import type { LineRecord, Record } from '../record';
import type { Stream } from '../stream';
import { files } from './producers';

export type ExecuteResult =
	| { kind: 'stream'; value: Stream<Record> }
	| { kind: 'sink'; value: Promise<void> };

export interface ExecuteContext {
	cwd: string;
	status?: number;
	globalVars?: Map<string, string>;
	localVars?: Map<string, string>;
}

interface NormalizedExecuteContext {
	cwd: string;
	status: number;
	globalVars: Map<string, string>;
	localVars: Map<string, string>;
}

const textEncoder = new TextEncoder();
const EFFECT_COMMANDS = new Set(['cd', 'cp', 'mkdir', 'mv', 'rm', 'touch']);
const LS_GLOB_PATTERN_REGEX = /[*?]/;
const MULTIPLE_SLASH_REGEX = /\/+/g;
const TRAILING_SLASH_REGEX = /\/+$/;
const ROOT_DIRECTORY = '/';
const VARIABLE_REFERENCE_REGEX = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UNSUPPORTED_GLOB_MESSAGE = 'unsupported wildcard pattern (glob)';

type EffectStep = Extract<
	StepIR,
	{ cmd: 'cd' | 'cp' | 'mkdir' | 'mv' | 'rm' | 'touch' }
>;
type StreamStep = Exclude<StepIR, EffectStep>;

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
): ExecuteResult {
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
): ExecuteResult {
	if (script.statements.length === 0) {
		return {
			kind: 'stream',
			value: emptyStream<Record>(),
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
): Stream<Record> {
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

async function drainResult(result: ExecuteResult): Promise<void> {
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
): ExecuteResult {
	if (ir.steps.length === 0) {
		return {
			kind: 'stream',
			value: emptyStream<Record>(),
		};
	}

	const lastStep = ir.steps.at(-1);
	if (!lastStep) {
		return {
			kind: 'stream',
			value: emptyStream<Record>(),
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
): Stream<Record> {
	return (async function* () {
		let stream: Stream<Record> | null = null;
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
	input: Stream<Record> | null,
	context: NormalizedExecuteContext
): Stream<Record> {
	switch (step.cmd) {
		case 'cat': {
			return (async function* (): Stream<Record> {
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
					await evaluateExpandedWords(step.args.files, fs, context),
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
		case 'head': {
			return (async function* (): Stream<Record> {
				const inputPath = getRedirectPath(step.redirections, 'input');
				const filePaths = withInputRedirect(
					await evaluateExpandedWords(step.args.files, fs, context),
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
			return (async function* () {
				assertNoUnsupportedGlobs('ls', step.args.paths);
				const paths = await evaluateExpandedWords(
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
			return (async function* () {
				const inputPath = getRedirectPath(step.redirections, 'input');
				const filePaths = withInputRedirect(
					await evaluateExpandedWords(step.args.files, fs, context),
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
			return (async function* (): Stream<Record> {
				yield* pwd(context.cwd);
				context.status = 0;
			})();
		}
		case 'echo': {
			return (async function* (): Stream<Record> {
				const values = await evaluateExpandedWords(
					step.args.values,
					fs,
					context
				);
				yield {
					kind: 'line',
					text: values.join(' '),
				} as const;
				context.status = 0;
			})();
		}
		case 'set': {
			return (async function* (): Stream<Record> {
				const name = await evaluateExpandedWord(
					step.args.name,
					fs,
					context
				);
				if (!VARIABLE_NAME_REGEX.test(name)) {
					throw new Error(`set: invalid variable name: ${name}`);
				}
				const values = await evaluateExpandedWords(
					step.args.values,
					fs,
					context
				);
				const value = values.join(' ');
				if (step.args.scope === 'global') {
					context.globalVars.set(name, value);
				} else {
					context.localVars.set(name, value);
				}
				context.status = 0;
				yield* emptyStream<Record>();
			})();
		}
		case 'test': {
			return (async function* (): Stream<Record> {
				const operands = await evaluateExpandedWords(
					step.args.operands,
					fs,
					context
				);
				context.status = evaluateTestStatus(operands);
				yield* emptyStream<Record>();
			})();
		}
		case 'read': {
			return (async function* (): Stream<Record> {
				const name = await evaluateExpandedWord(
					step.args.name,
					fs,
					context
				);
				if (!VARIABLE_NAME_REGEX.test(name)) {
					throw new Error(`read: invalid variable name: ${name}`);
				}
				if (!input) {
					context.status = 1;
					yield* emptyStream<Record>();
					return;
				}
				const value = await readFromStream(fs, input);
				if (value === null) {
					context.status = 1;
					yield* emptyStream<Record>();
					return;
				}
				context.localVars.set(name, value);
				context.status = 0;
				yield* emptyStream<Record>();
			})();
		}
		case 'string': {
			return executeStringStep(step, fs, context);
		}
		default: {
			const _exhaustive: never = step;
			throw new Error(
				`Unknown command: ${String((_exhaustive as { cmd: string }).cmd)}`
			);
		}
	}
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
	const normalizedPath = `${ROOT_DIRECTORY}${normalizedSegments.join(ROOT_DIRECTORY)}`;
	return normalizedPath === '' ? ROOT_DIRECTORY : normalizedPath;
}

function normalizeCwd(cwd: string): string {
	if (cwd === '') {
		return ROOT_DIRECTORY;
	}
	const normalized = normalizeAbsolutePath(cwd);
	const trimmed = normalized.replace(TRAILING_SLASH_REGEX, '');
	return trimmed === '' ? ROOT_DIRECTORY : trimmed;
}

function normalizeContext(context: ExecuteContext): NormalizedExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	context.status ??= 0;
	context.globalVars ??= new Map<string, string>();
	context.localVars ??= new Map<string, string>();
	return context as NormalizedExecuteContext;
}

function resolvePathFromCwd(cwd: string, path: string): string {
	if (path === '') {
		return cwd;
	}
	if (path.startsWith(ROOT_DIRECTORY)) {
		return normalizeAbsolutePath(path);
	}
	return normalizeAbsolutePath(`${cwd}/${path}`);
}

async function executeEffectStep(
	step: EffectStep,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<void> {
	switch (step.cmd) {
		case 'cd': {
			assertNoUnsupportedGlobs('cd', [step.args.path]);
			const requestedPath = await evaluateExpandedWord(
				step.args.path,
				fs,
				context
			);
			if (requestedPath === '') {
				throw new Error('cd: empty path');
			}
			const resolvedPath = resolvePathFromCwd(context.cwd, requestedPath);
			let stat: Awaited<ReturnType<FS['stat']>>;
			try {
				stat = await fs.stat(resolvedPath);
			} catch {
				throw new Error(
					`cd: directory does not exist: ${requestedPath}`
				);
			}

			if (!stat.isDirectory) {
				throw new Error(`cd: not a directory: ${requestedPath}`);
			}

			context.cwd = resolvedPath;
			context.status = 0;
			break;
		}
		case 'cp': {
			assertNoUnsupportedGlobs('cp', [...step.args.srcs, step.args.dest]);
			const srcPaths = await evaluateExpandedWords(
				step.args.srcs,
				fs,
				context
			);
			const destPath = await evaluateExpandedWord(
				step.args.dest,
				fs,
				context
			);
			await cp(fs)({
				srcs: srcPaths,
				dest: destPath,
				force: step.args.force,
				interactive: step.args.interactive,
				recursive: step.args.recursive,
			});
			context.status = 0;
			break;
		}
		case 'mkdir': {
			assertNoUnsupportedGlobs('mkdir', step.args.paths);
			const paths = await evaluateExpandedWords(
				step.args.paths,
				fs,
				context
			);
			for (const path of paths) {
				await mkdir(fs)({ path, recursive: step.args.recursive });
			}
			context.status = 0;
			break;
		}
		case 'mv': {
			assertNoUnsupportedGlobs('mv', [...step.args.srcs, step.args.dest]);
			const srcPaths = await evaluateExpandedWords(
				step.args.srcs,
				fs,
				context
			);
			const destPath = await evaluateExpandedWord(
				step.args.dest,
				fs,
				context
			);
			await mv(fs)({
				srcs: srcPaths,
				dest: destPath,
				force: step.args.force,
				interactive: step.args.interactive,
			});
			context.status = 0;
			break;
		}
		case 'rm': {
			assertNoUnsupportedGlobs('rm', step.args.paths);
			const paths = await evaluateExpandedWords(
				step.args.paths,
				fs,
				context
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
			assertNoUnsupportedGlobs('touch', step.args.files);
			const filePaths = await evaluateExpandedWords(
				step.args.files,
				fs,
				context
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

function assertNoUnsupportedGlobs(
	command: string,
	words: ExpandedWord[]
): void {
	for (const word of words) {
		if (word.kind === 'glob') {
			throw new Error(`${command}: ${UNSUPPORTED_GLOB_MESSAGE}`);
		}
	}
}

function resolveVariable(
	variableName: string,
	context: NormalizedExecuteContext
): string {
	if (variableName === 'status') {
		return String(context.status);
	}
	return (
		context.localVars.get(variableName) ??
		context.globalVars.get(variableName) ??
		''
	);
}

function expandVariables(
	input: string,
	context: NormalizedExecuteContext
): string {
	return input.replace(VARIABLE_REFERENCE_REGEX, (_full, variableName) => {
		return resolveVariable(variableName, context);
	});
}

async function evaluateExpandedWords(
	words: ExpandedWord[],
	fs: FS,
	context: NormalizedExecuteContext
): Promise<string[]> {
	const resolvedWords: string[] = [];
	for (const word of words) {
		resolvedWords.push(await evaluateExpandedWord(word, fs, context));
	}
	return resolvedWords;
}

async function evaluateExpandedWord(
	word: ExpandedWord,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<string> {
	switch (word.kind) {
		case 'literal':
			return expandVariables(word.value, context);
		case 'glob':
			return expandVariables(word.pattern, context);
		case 'commandSub': {
			const commandText = expandVariables(word.command, context);
			return await evaluateCommandSubstitution(commandText, fs, context);
		}
		default: {
			const _exhaustive: never = word;
			throw new Error(
				`Unknown word kind: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}

async function evaluateCommandSubstitution(
	command: string,
	fs: FS,
	context: NormalizedExecuteContext
): Promise<string> {
	const parsed = parse(command);
	const nestedIR = compile(parsed);
	const result = execute(nestedIR, fs, context);
	const outputs = await collectOutputRecords(result);
	return outputs.join('\n');
}

async function collectOutputRecords(result: ExecuteResult): Promise<string[]> {
	if (result.kind === 'sink') {
		await result.value;
		return [];
	}

	const outputs: string[] = [];
	for await (const record of result.value) {
		outputs.push(formatRecord(record));
	}
	return outputs;
}

function evaluateTestStatus(operands: string[]): 0 | 1 {
	if (operands.length === 1) {
		return operands[0] === '' ? 1 : 0;
	}

	if (operands.length === 3) {
		const [left, operator, right] = operands;
		if (operator === '=') {
			return left === right ? 0 : 1;
		}
		if (operator === '!=') {
			return left !== right ? 0 : 1;
		}
	}

	throw new Error('test: unsupported arguments');
}

function executeStringStep(
	step: Extract<StreamStep, { cmd: 'string' }>,
	fs: FS,
	context: NormalizedExecuteContext
): Stream<Record> {
	return (async function* (): Stream<Record> {
		const subcommand = await evaluateExpandedWord(
			step.args.subcommand,
			fs,
			context
		);
		const operands = await evaluateExpandedWords(
			step.args.operands,
			fs,
			context
		);

		if (subcommand === 'replace') {
			yield* executeStringReplace(operands, context);
			return;
		}

		if (subcommand === 'match') {
			yield* executeStringMatch(operands, context);
			return;
		}

		throw new Error(`string: unsupported subcommand: ${subcommand}`);
	})();
}

async function* executeStringReplace(
	operands: string[],
	context: NormalizedExecuteContext
): Stream<Record> {
	if (operands[0]?.startsWith('-')) {
		throw new Error(`string replace: unsupported flag: ${operands[0]}`);
	}

	if (operands.length < 3) {
		throw new Error('string replace requires pattern replacement text');
	}
	const [pattern, replacement, ...inputs] = operands;
	if (inputs.length === 0) {
		context.status = 1;
		return;
	}
	for (const input of inputs) {
		yield {
			kind: 'line',
			text: input.replaceAll(pattern, replacement),
		} as const;
	}
	context.status = 0;
}

async function* executeStringMatch(
	operands: string[],
	context: NormalizedExecuteContext
): Stream<Record> {
	let quiet = false;
	let offset = 0;

	while (operands[offset]?.startsWith('-')) {
		const flag = operands[offset];
		if (flag === '-q' && !quiet) {
			quiet = true;
			offset += 1;
			continue;
		}

		throw new Error(`string match: unsupported flag: ${flag}`);
	}

	const filtered = operands.slice(offset);
	const [pattern, value] = filtered;
	if (!(pattern && value !== undefined)) {
		throw new Error('string match requires pattern and value');
	}
	if (filtered.length > 2) {
		throw new Error('string match: unsupported arguments');
	}
	const isMatch = picomatch(pattern, { dot: true })(value);
	context.status = isMatch ? 0 : 1;
	if (isMatch && !quiet) {
		yield { kind: 'line', text: value } as const;
	}
}

async function readFromStream(
	fs: FS,
	input: Stream<Record>
): Promise<string | null> {
	let firstValue: string | null = null;
	for await (const record of input) {
		const value = await recordToText(fs, record);
		if (firstValue === null) {
			firstValue = value;
		}
	}
	return firstValue;
}

async function recordToText(fs: FS, record: Record): Promise<string> {
	if (record.kind === 'line') {
		return record.text;
	}
	if (record.kind === 'file') {
		for await (const line of fs.readLines(record.path)) {
			return line;
		}
		return '';
	}
	return JSON.stringify(record.value);
}

async function* toLineStream(
	fs: FS,
	input: Stream<Record>
): Stream<LineRecord> {
	for await (const record of input) {
		if (record.kind === 'line') {
			yield record;
			continue;
		}

		if (record.kind === 'file') {
			let lineNum = 1;
			for await (const text of fs.readLines(record.path)) {
				yield {
					kind: 'line',
					text,
					file: record.path,
					lineNum: lineNum++,
				};
			}
			continue;
		}

		yield {
			kind: 'line',
			text: JSON.stringify(record.value),
		};
	}
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
	if (path.startsWith('/')) {
		return path;
	}
	return `${cwd}/${path}`;
}

function trimTrailingSlash(path: string): string {
	if (path === '/') {
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
	if (LS_GLOB_PATTERN_REGEX.test(normalizedPath)) {
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
	if (directoryPath === '/') {
		return '/*';
	}
	return `${directoryPath}/*`;
}

function getRedirectPath(
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind']
): string | null {
	if (!redirections) {
		return null;
	}

	let redirectedPath: string | null = null;
	for (const redirection of redirections) {
		if (redirection.kind === kind) {
			redirectedPath = expandedWordToString(redirection.target);
		}
	}
	return redirectedPath;
}

function withInputRedirect(
	paths: string[],
	inputPath: string | null
): string[] {
	if (paths.length > 0 || !inputPath) {
		return paths;
	}
	return [inputPath];
}

function applyOutputRedirect(
	result: ExecuteResult,
	step: StepIR,
	fs: FS
): ExecuteResult {
	const outputPath = getRedirectPath(step.redirections, 'output');
	if (!outputPath) {
		return result;
	}

	if (result.kind === 'stream') {
		return {
			kind: 'sink',
			value: writeStreamToFile(result.value, outputPath, fs),
		};
	}

	return {
		kind: 'sink',
		value: result.value.then(async () => {
			await fs.writeFile(outputPath, textEncoder.encode(''));
		}),
	};
}

async function writeStreamToFile(
	stream: Stream<Record>,
	path: string,
	fs: FS
): Promise<void> {
	const outputChunks: string[] = [];
	for await (const record of stream) {
		outputChunks.push(formatRecord(record));
	}
	await fs.writeFile(path, textEncoder.encode(outputChunks.join('\n')));
}

function formatRecord(record: Record): string {
	switch (record.kind) {
		case 'line':
			return record.text;
		case 'file':
			return record.path;
		case 'json':
			return JSON.stringify(record.value);
		default:
			throw new Error('Unknown record kind');
	}
}
