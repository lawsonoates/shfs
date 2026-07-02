import type { StepIR } from '@shfs/compiler';
import { Effect } from 'effect';
import { cd } from '../builtin/cd/cd';
import { echo } from '../builtin/echo/echo';
import { read } from '../builtin/read/read';
import { set } from '../builtin/set/set';
import { string } from '../builtin/string/string';
import { test } from '../builtin/test/test';
import type { BuiltinContext, BuiltinRuntime } from '../builtin/types';
import {
	isShellRuntimeError,
	runOrReport,
	type ShellErrorCause,
	ShellRuntimeError,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { cat } from '../operator/cat/cat';
import { cp } from '../operator/cp/cp';
import { find } from '../operator/find/find';
import { runGrepCommand } from '../operator/grep/grep';
import { headLines, headWithN } from '../operator/head/head';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { mv } from '../operator/mv/mv';
import { pwd } from '../operator/pwd/pwd';
import { rm } from '../operator/rm/rm';
import { runSortCommand } from '../operator/sort/sort';
import { tail } from '../operator/tail/tail';
import { touch } from '../operator/touch/touch';
import { createTreeResolvedArgs, runTreeCommand } from '../operator/tree/tree';
import { runWcCommand } from '../operator/wc/wc';
import { runXargsCommand } from '../operator/xargs/xargs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import { BufferedShellOutput, createShellInput } from './io';
import {
	evaluateExpandedPathWordsEffect,
	evaluateExpandedSinglePathEffect,
	evaluateExpandedWordsEffect,
	resolvePathsFromCwd,
} from './path';
import { files } from './producers';
import { toFormattedLineStream } from './records';
import {
	resolveInputRedirectEffect,
	resolveRedirectPathEffect,
	withInputRedirect,
} from './redirection';

export type EffectStep = Extract<
	StepIR,
	{ cmd: 'cd' | 'cp' | 'mkdir' | 'mv' | 'rm' | 'touch' }
>;
type StreamStep = Exclude<StepIR, EffectStep>;
type EffectCommand = EffectStep['cmd'];
type StreamCommand = StreamStep['cmd'];

export type ExecuteStepContext = BuiltinContext;

interface ExecuteStreamStepParams {
	step: StreamStep;
	fs: FS;
	input: Stream<ShellRecord> | null;
	context: ExecuteStepContext;
	resolvedOutputRedirectPath?: string;
}

interface ExecuteEffectStepParams {
	step: EffectStep;
	fs: FS;
	context: ExecuteStepContext;
}

const EFFECT_COMMANDS = ['cd', 'cp', 'mkdir', 'mv', 'rm', 'touch'] as const;
const EFFECT_COMMAND_SET = new Set<StepIR['cmd']>(EFFECT_COMMANDS);
const STREAM_COMMANDS = [
	'cat',
	'echo',
	'find',
	'grep',
	'head',
	'ls',
	'pwd',
	'read',
	'set',
	'sort',
	'string',
	'tail',
	'test',
	'tree',
	'xargs',
	'wc',
] as const;
const STREAM_COMMAND_SET = new Set<StepIR['cmd']>(STREAM_COMMANDS);
const ROOT_DIRECTORY = '/';

function lineRecordsFromPath(fs: FS, path: string): Stream<ShellRecord> {
	return (async function* (): Stream<ShellRecord> {
		for await (const line of fs.readLines(path)) {
			yield {
				kind: 'line',
				text: line,
			};
		}
	})();
}

let commandRegistriesVerified = false;

type StreamStepForCommand<TCommand extends StreamCommand> = Extract<
	StreamStep,
	{ cmd: TCommand }
>;
type EffectStepForCommand<TCommand extends EffectCommand> = Extract<
	EffectStep,
	{ cmd: TCommand }
>;

type StreamCommandHandler<TCommand extends StreamCommand = StreamCommand> =
	(params: {
		step: StreamStepForCommand<TCommand>;
		fs: FS;
		input: Stream<ShellRecord> | null;
		context: ExecuteStepContext;
		resolvedOutputRedirectPath?: string;
	}) => Stream<ShellRecord>;

type EffectCommandHandler<TCommand extends EffectCommand = EffectCommand> =
	(params: {
		step: EffectStepForCommand<TCommand>;
		fs: FS;
		context: ExecuteStepContext;
	}) => Effect.Effect<void, ShellErrorCause>;

type CommandRegistryEntry =
	| {
			kind: 'stream';
			handler: StreamCommandHandler;
	  }
	| {
			kind: 'effect';
			handler: EffectCommandHandler;
	  };

interface StreamCommandEntry<TCommand extends StreamCommand> {
	kind: 'stream';
	handler: StreamCommandHandler<TCommand>;
}

interface EffectCommandEntry<TCommand extends EffectCommand> {
	kind: 'effect';
	handler: EffectCommandHandler<TCommand>;
}

function isStreamCommand(command: StepIR['cmd']): command is StreamCommand {
	return STREAM_COMMAND_SET.has(command);
}

function missingCommandHandlerError(
	command: StepIR['cmd'],
	kind: CommandRegistryEntry['kind']
): ShellRuntimeError {
	return new ShellRuntimeError({
		exitCode: 1,
		message: `Missing ${kind} command handler: ${command}`,
	});
}

function unknownCommandError(command: StepIR['cmd']): ShellRuntimeError {
	return new ShellRuntimeError({
		exitCode: 1,
		message: `Unknown command: ${command}`,
	});
}

function commandKindError(
	command: StepIR['cmd'],
	kind: CommandRegistryEntry['kind']
): ShellRuntimeError {
	return new ShellRuntimeError({
		exitCode: 1,
		message: `Command "${command}" is not a ${kind} command`,
	});
}

function verifyCommandRegistries(): ShellRuntimeError | null {
	if (commandRegistriesVerified) {
		return null;
	}

	for (const command of EFFECT_COMMANDS) {
		if (commands.get(command)?.kind !== 'effect') {
			return missingCommandHandlerError(command, 'effect');
		}
	}

	for (const command of STREAM_COMMANDS) {
		if (commands.get(command)?.kind !== 'stream') {
			return missingCommandHandlerError(command, 'stream');
		}
	}

	commandRegistriesVerified = true;
	return null;
}

function failedStreamCommand(
	context: ExecuteStepContext,
	error: ShellRuntimeError
): Stream<ShellRecord> {
	context.status = error.exitCode;
	context.stderr.append(error.message);
	return (async function* (): Stream<ShellRecord> {
		// no records
	})();
}

function executeStreamStep({
	step,
	fs,
	input,
	context,
	resolvedOutputRedirectPath,
}: ExecuteStreamStepParams): Stream<ShellRecord> {
	const verificationError = verifyCommandRegistries();
	if (verificationError) {
		return failedStreamCommand(context, verificationError);
	}
	if (!isStreamCommand(step.cmd)) {
		return failedStreamCommand(
			context,
			commandKindError(step.cmd, 'stream')
		);
	}
	const handler = CommandRegistry.getStream(step.cmd);
	if (isShellRuntimeError(handler)) {
		return failedStreamCommand(context, handler);
	}
	return handler({
		step: step as StreamStepForCommand<typeof step.cmd>,
		fs,
		input,
		context,
		resolvedOutputRedirectPath,
	});
}

function executeEffectStep({
	step,
	fs,
	context,
}: ExecuteEffectStepParams): Effect.Effect<void, ShellErrorCause> {
	return Effect.gen(function* () {
		const verificationError = verifyCommandRegistries();
		if (verificationError) {
			return yield* verificationError;
		}
		const handler = yield* CommandRegistry.getEffect(step.cmd);
		return yield* handler({
			step,
			fs,
			context,
		});
	});
}

function createBuiltinRuntime(
	fs: FS,
	context: ExecuteStepContext,
	input: Stream<ShellRecord> | null
): BuiltinRuntime {
	const stdin = createShellInput(input);
	return {
		fs,
		context,
		input,
		io: {
			stderr: context.stderr,
			stdin,
			stdout: new BufferedShellOutput(),
		},
		stdin,
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

function resolveLsPath(path: string, cwd: string): string {
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

const commands = new Map<StepIR['cmd'], CommandRegistryEntry>();

function register<TCommand extends StreamCommand>(
	command: TCommand,
	entry: StreamCommandEntry<TCommand>
): void;
function register<TCommand extends EffectCommand>(
	command: TCommand,
	entry: EffectCommandEntry<TCommand>
): void;
function register(command: StepIR['cmd'], entry: CommandRegistryEntry): void {
	commands.set(command, entry);
}

function getStream<TCommand extends StreamCommand>(
	command: TCommand
): ShellRuntimeError | StreamCommandHandler<TCommand> {
	const entry = commands.get(command);
	if (!entry) {
		return unknownCommandError(command);
	}
	if (entry.kind !== 'stream') {
		return commandKindError(command, 'stream');
	}
	return entry.handler as unknown as StreamCommandHandler<TCommand>;
}

function getEffect<TCommand extends EffectCommand>(
	command: TCommand
): Effect.Effect<EffectCommandHandler<TCommand>, ShellErrorCause> {
	const entry = commands.get(command);
	if (!entry) {
		return Effect.fail(unknownCommandError(command));
	}
	if (entry.kind !== 'effect') {
		return Effect.fail(commandKindError(command, 'effect'));
	}
	return Effect.succeed(
		entry.handler as unknown as EffectCommandHandler<TCommand>
	);
}

function isEffectStep(step: StepIR): step is EffectStep {
	return EFFECT_COMMAND_SET.has(step.cmd);
}

function executeStep(params: ExecuteStreamStepParams): Stream<ShellRecord>;
function executeStep(
	params: ExecuteEffectStepParams
): Effect.Effect<void, ShellErrorCause>;
function executeStep(
	params: ExecuteStreamStepParams | ExecuteEffectStepParams
): Stream<ShellRecord> | Effect.Effect<void, ShellErrorCause> {
	if (isEffectStep(params.step)) {
		return executeEffectStep(params as ExecuteEffectStepParams);
	}
	return executeStreamStep(params as ExecuteStreamStepParams);
}

export const CommandRegistry = {
	executeStep,
	getEffect,
	getStream,
	isEffectStep,
	register,
};

CommandRegistry.register('cat', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
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
			const inputPathResult = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPathResult.ok) {
				return;
			}
			const expandedFiles = await runOrReport(
				evaluateExpandedPathWordsEffect(
					'cat',
					step.args.files,
					fs,
					context
				),
				context
			);
			if (!expandedFiles.ok) {
				return;
			}
			const filePaths = withInputRedirect(
				resolvePathsFromCwd(context.cwd, expandedFiles.value),
				inputPathResult.value
			);
			if (filePaths.length > 0) {
				yield* cat(fs, options)(files(...filePaths));
				context.status = 0;
				return;
			}
			if (input) {
				yield* cat(fs, options)(toFormattedLineStream(input));
			}
			context.status = 0;
		})();
	},
});

CommandRegistry.register('grep', {
	kind: 'stream',
	handler: ({ step, fs, input, context, resolvedOutputRedirectPath }) => {
		return (async function* (): Stream<ShellRecord> {
			const result = await runGrepCommand({
				context,
				fs,
				input,
				parsed: step.args,
				redirections: step.redirections,
				resolvedOutputRedirectPath,
				stdin: createShellInput(input),
			});
			context.status = result.exitCode;
			context.stderr.appendLines(result.stderr);
			for (const text of result.stdout) {
				yield {
					kind: 'line',
					text,
				};
			}
		})();
	},
});

CommandRegistry.register('find', {
	kind: 'stream',
	handler: ({ step, fs, context }) => {
		return find(fs, context, step.args);
	},
});

CommandRegistry.register('xargs', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPath.ok) {
				return;
			}
			const result = await runXargsCommand({
				context,
				fs,
				input,
				inputPath: inputPath.value,
				parsed: step.args,
				stdin: createShellInput(input),
			});
			context.status = result.exitCode;
			context.stderr.appendLines(result.stderr);
			for (const text of result.stdout) {
				yield {
					kind: 'line',
					text,
				};
			}
		})();
	},
});

CommandRegistry.register('wc', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPath.ok) {
				return;
			}
			const result = await runWcCommand({
				context,
				fs,
				input,
				inputPath: inputPath.value,
				parsed: step.args,
				stdin: createShellInput(input),
			});
			context.status = result.exitCode;
			context.stderr.appendLines(result.stderr);
			for (const text of result.stdout) {
				yield {
					kind: 'line',
					text,
				};
			}
		})();
	},
});

CommandRegistry.register('sort', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPath.ok) {
				return;
			}
			const result = await runSortCommand({
				context,
				fs,
				input,
				inputPath: inputPath.value,
				parsed: step.args,
				stdin: createShellInput(input),
			});
			context.status = result.exitCode;
			context.stderr.appendLines(result.stderr);
			for (const text of result.stdout) {
				yield { kind: 'line', text };
			}
		})();
	},
});

CommandRegistry.register('tree', {
	kind: 'stream',
	handler: ({ step, fs, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const expandedPaths = await runOrReport(
				evaluateExpandedPathWordsEffect(
					'tree',
					step.args.paths,
					fs,
					context
				),
				context
			);
			if (!expandedPaths.ok) {
				return;
			}
			const paths = resolvePathsFromCwd(context.cwd, expandedPaths.value);
			const includePatterns = await runOrReport(
				evaluateExpandedWordsEffect(
					step.args.includePatterns,
					fs,
					context
				),
				context
			);
			if (!includePatterns.ok) {
				return;
			}
			const excludePatterns = await runOrReport(
				evaluateExpandedWordsEffect(
					step.args.excludePatterns,
					fs,
					context
				),
				context
			);
			if (!excludePatterns.ok) {
				return;
			}
			const result = await runTreeCommand(
				fs,
				context.cwd,
				createTreeResolvedArgs({
					...step.args,
					excludePatterns: excludePatterns.value,
					includePatterns: includePatterns.value,
					paths,
				})
			);
			context.status = result.exitCode;
			context.stderr.appendLines(result.stderr);
			for (const text of result.stdout) {
				yield { kind: 'line', text };
			}
		})();
	},
});

CommandRegistry.register('head', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPath.ok) {
				return;
			}
			const expandedFiles = await runOrReport(
				evaluateExpandedPathWordsEffect(
					'head',
					step.args.files,
					fs,
					context
				),
				context
			);
			if (!expandedFiles.ok) {
				return;
			}
			const filePaths = withInputRedirect(
				resolvePathsFromCwd(context.cwd, expandedFiles.value),
				inputPath.value
			);
			if (filePaths.length > 0) {
				yield* headWithN(fs, step.args.n)(files(...filePaths));
				context.status = 0;
				return;
			}
			if (input) {
				yield* headLines(step.args.n)(toFormattedLineStream(input));
			}
			context.status = 0;
		})();
	},
});

CommandRegistry.register('ls', {
	kind: 'stream',
	handler: ({ step, fs, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const paths = await runOrReport(
				evaluateExpandedPathWordsEffect(
					'ls',
					step.args.paths,
					fs,
					context
				),
				context
			);
			if (!paths.ok) {
				return;
			}
			for (const inputPath of paths.value) {
				const resolvedPath = resolveLsPath(inputPath, context.cwd);
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
	},
});

CommandRegistry.register('tail', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await runOrReport(
				resolveRedirectPathEffect(
					step.cmd,
					step.redirections,
					'input',
					fs,
					context
				),
				context
			);
			if (!inputPath.ok) {
				return;
			}
			const expandedFiles = await runOrReport(
				evaluateExpandedPathWordsEffect(
					'tail',
					step.args.files,
					fs,
					context
				),
				context
			);
			if (!expandedFiles.ok) {
				return;
			}
			const filePaths = withInputRedirect(
				resolvePathsFromCwd(context.cwd, expandedFiles.value),
				inputPath.value
			);
			if (filePaths.length > 0) {
				for (const filePath of filePaths) {
					yield* tail(step.args.n)(cat(fs)(files(filePath)));
				}
				context.status = 0;
				return;
			}
			if (input) {
				yield* tail(step.args.n)(toFormattedLineStream(input));
			}
			context.status = 0;
		})();
	},
});

CommandRegistry.register('pwd', {
	kind: 'stream',
	handler: ({ context }) => {
		return (async function* (): Stream<ShellRecord> {
			yield* pwd(context.cwd);
			context.status = 0;
		})();
	},
});

CommandRegistry.register('echo', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return echo(createBuiltinRuntime(fs, context, input), step.args);
	},
});

CommandRegistry.register('set', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return set(createBuiltinRuntime(fs, context, input), step.args);
	},
});

CommandRegistry.register('test', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return test(createBuiltinRuntime(fs, context, input), step.args);
	},
});

CommandRegistry.register('read', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const resolvedInput = await runOrReport(
				resolveInputRedirectEffect(
					step.cmd,
					step.redirections,
					fs,
					context
				),
				context
			);
			if (!resolvedInput.ok) {
				return;
			}
			if (resolvedInput.value.closed) {
				context.stderr.append('read: stdin is closed');
				context.status = 1;
				return;
			}
			const redirectedInput = resolvedInput.value.path
				? lineRecordsFromPath(fs, resolvedInput.value.path)
				: input;
			yield* read(
				createBuiltinRuntime(fs, context, redirectedInput),
				step.args
			);
		})();
	},
});

CommandRegistry.register('string', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return string(createBuiltinRuntime(fs, context, input), step.args);
	},
});

CommandRegistry.register('cd', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.cd')(function* ({ step, fs, context }) {
		yield* cd(createBuiltinRuntime(fs, context, null), step.args);
	}),
});

CommandRegistry.register('cp', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.cp')(function* ({ step, fs, context }) {
		const srcValues = yield* evaluateExpandedPathWordsEffect(
			'cp',
			step.args.srcs,
			fs,
			context
		);
		const srcPaths = resolvePathsFromCwd(context.cwd, srcValues);
		const destinationValue = yield* evaluateExpandedSinglePathEffect(
			'cp',
			'destination must expand to exactly 1 path',
			step.args.dest,
			fs,
			context
		);
		const destinationPaths = resolvePathsFromCwd(context.cwd, [
			destinationValue,
		]);
		const destinationPath = destinationPaths.at(0);
		if (destinationPath === undefined) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: 'cp: destination missing after expansion',
			});
		}
		yield* cp(fs)({
			srcs: srcPaths,
			dest: destinationPath,
			force: step.args.force,
			interactive: step.args.interactive,
			recursive: step.args.recursive,
		});
		context.status = 0;
	}),
});

CommandRegistry.register('mkdir', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.mkdir')(function* ({
		step,
		fs,
		context,
	}) {
		const pathValues = yield* evaluateExpandedPathWordsEffect(
			'mkdir',
			step.args.paths,
			fs,
			context
		);
		const paths = resolvePathsFromCwd(context.cwd, pathValues);
		for (const path of paths) {
			yield* mkdir(fs)({ path, recursive: step.args.recursive });
		}
		context.status = 0;
	}),
});

CommandRegistry.register('mv', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.mv')(function* ({ step, fs, context }) {
		const srcValues = yield* evaluateExpandedPathWordsEffect(
			'mv',
			step.args.srcs,
			fs,
			context
		);
		const srcPaths = resolvePathsFromCwd(context.cwd, srcValues);
		const destinationValue = yield* evaluateExpandedSinglePathEffect(
			'mv',
			'destination must expand to exactly 1 path',
			step.args.dest,
			fs,
			context
		);
		const destinationPaths = resolvePathsFromCwd(context.cwd, [
			destinationValue,
		]);
		const destinationPath = destinationPaths.at(0);
		if (destinationPath === undefined) {
			return yield* new ShellRuntimeError({
				exitCode: 1,
				message: 'mv: destination missing after expansion',
			});
		}
		yield* mv(fs)({
			srcs: srcPaths,
			dest: destinationPath,
			force: step.args.force,
			interactive: step.args.interactive,
		});
		context.status = 0;
	}),
});

CommandRegistry.register('rm', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.rm')(function* ({ step, fs, context }) {
		const pathValues = yield* evaluateExpandedPathWordsEffect(
			'rm',
			step.args.paths,
			fs,
			context
		);
		const paths = resolvePathsFromCwd(context.cwd, pathValues);
		for (const path of paths) {
			yield* rm(fs)({
				path,
				force: step.args.force,
				interactive: step.args.interactive,
				recursive: step.args.recursive,
			});
		}
		context.status = 0;
	}),
});

CommandRegistry.register('touch', {
	kind: 'effect',
	handler: Effect.fn('CommandRegistry.touch')(function* ({
		step,
		fs,
		context,
	}) {
		const fileValues = yield* evaluateExpandedPathWordsEffect(
			'touch',
			step.args.files,
			fs,
			context
		);
		const filePaths = resolvePathsFromCwd(context.cwd, fileValues);
		yield* touch(fs)({
			files: filePaths,
			accessTimeOnly: step.args.accessTimeOnly,
			modificationTimeOnly: step.args.modificationTimeOnly,
		});
		context.status = 0;
	}),
});
