import {
	expandedWordToString,
	extractPathsFromExpandedWords,
	type PipelineIR,
	type RedirectionIR,
	type ScriptIR,
	type StepIR,
} from '@shfs/compiler';
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
}

const textEncoder = new TextEncoder();
const EFFECT_COMMANDS = new Set(['cd', 'cp', 'mkdir', 'mv', 'rm', 'touch']);
const LS_GLOB_PATTERN_REGEX = /[*?]/;
const MULTIPLE_SLASH_REGEX = /\/+/g;
const TRAILING_SLASH_REGEX = /\/+$/;
const ROOT_DIRECTORY = '/';

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

function executeScript(
	script: ScriptIR,
	fs: FS,
	context: ExecuteContext
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
	context: ExecuteContext
): Promise<void> {
	for (const statement of script.statements) {
		const result = executePipeline(statement.pipeline, fs, context);
		await drainResult(result);
	}
}

async function* runScriptToStream(
	script: ScriptIR,
	fs: FS,
	context: ExecuteContext
): Stream<Record> {
	for (const statement of script.statements) {
		const result = executePipeline(statement.pipeline, fs, context);
		if (result.kind === 'sink') {
			await result.value;
			continue;
		}
		yield* result.value;
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
	context: ExecuteContext
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
	context: ExecuteContext
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
	context: ExecuteContext
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
	context: ExecuteContext
): Stream<Record> {
	switch (step.cmd) {
		case 'cat': {
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
				extractPathsFromExpandedWords(step.args.files),
				inputPath
			);
			if (filePaths.length > 0) {
				return cat(fs, options)(files(...filePaths));
			}
			if (input) {
				return cat(fs, options)(input);
			}
			return emptyStream<Record>();
		}
		case 'head': {
			const inputPath = getRedirectPath(step.redirections, 'input');
			const filePaths = withInputRedirect(
				extractPathsFromExpandedWords(step.args.files),
				inputPath
			);
			if (filePaths.length > 0) {
				return headWithN(fs, step.args.n)(files(...filePaths));
			}
			if (!input) {
				return emptyStream<Record>();
			}
			return headLines(step.args.n)(toLineStream(fs, input));
		}
		case 'ls': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			return (async function* () {
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
			})();
		}
		case 'tail': {
			const inputPath = getRedirectPath(step.redirections, 'input');
			const filePaths = withInputRedirect(
				extractPathsFromExpandedWords(step.args.files),
				inputPath
			);
			if (filePaths.length > 0) {
				return (async function* () {
					for (const filePath of filePaths) {
						yield* tail(step.args.n)(cat(fs)(files(filePath)));
					}
				})();
			}
			if (!input) {
				return emptyStream<Record>();
			}
			return tail(step.args.n)(toLineStream(fs, input));
		}
		case 'pwd': {
			return pwd(context.cwd);
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

function normalizeContext(context: ExecuteContext): ExecuteContext {
	context.cwd = normalizeCwd(context.cwd);
	return context;
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
	context: ExecuteContext
): Promise<void> {
	switch (step.cmd) {
		case 'cd': {
			const requestedPath = expandedWordToString(step.args.path);
			const resolvedPath = resolvePathFromCwd(context.cwd, requestedPath);
			let stat: Awaited<ReturnType<FS['stat']>>;
			try {
				stat = await fs.stat(resolvedPath);
			} catch {
				throw new Error(
					`cd: no such file or directory: ${requestedPath}`
				);
			}

			if (!stat.isDirectory) {
				throw new Error(`cd: not a directory: ${requestedPath}`);
			}

			context.cwd = resolvedPath;
			break;
		}
		case 'cp': {
			const srcPaths = extractPathsFromExpandedWords(step.args.srcs);
			const destPath = expandedWordToString(step.args.dest);
			await cp(fs)({
				srcs: srcPaths,
				dest: destPath,
				force: step.args.force,
				interactive: step.args.interactive,
				recursive: step.args.recursive,
			});
			break;
		}
		case 'mkdir': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			for (const path of paths) {
				await mkdir(fs)({ path, recursive: step.args.recursive });
			}
			break;
		}
		case 'mv': {
			const srcPaths = extractPathsFromExpandedWords(step.args.srcs);
			const destPath = expandedWordToString(step.args.dest);
			await mv(fs)({
				srcs: srcPaths,
				dest: destPath,
				force: step.args.force,
				interactive: step.args.interactive,
			});
			break;
		}
		case 'rm': {
			const paths = extractPathsFromExpandedWords(step.args.paths);
			for (const path of paths) {
				await rm(fs)({
					path,
					force: step.args.force,
					interactive: step.args.interactive,
					recursive: step.args.recursive,
				});
			}
			break;
		}
		case 'touch': {
			const filePaths = extractPathsFromExpandedWords(step.args.files);
			await touch(fs)({
				files: filePaths,
				accessTimeOnly: step.args.accessTimeOnly,
				modificationTimeOnly: step.args.modificationTimeOnly,
			});
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
