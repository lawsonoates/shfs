import type { StepIR } from '@shfs/compiler';
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
import { find } from '../operator/find/find';
import { runGrepCommand } from '../operator/grep/grep';
import { headLines, headWithN } from '../operator/head/head';
import { ls } from '../operator/ls/ls';
import { mkdir } from '../operator/mkdir/mkdir';
import { mv } from '../operator/mv/mv';
import { pwd } from '../operator/pwd/pwd';
import { rm } from '../operator/rm/rm';
import { tail } from '../operator/tail/tail';
import { touch } from '../operator/touch/touch';
import { runXargsCommand } from '../operator/xargs/xargs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import {
	evaluateExpandedPathWords,
	evaluateExpandedSinglePath,
	resolvePathsFromCwd,
} from './path';
import { files } from './producers';
import { toFormattedLineStream } from './records';
import {
	resolveInputRedirect,
	resolveRedirectPath,
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
	'string',
	'tail',
	'test',
	'xargs',
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
	}) => Promise<void>;

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

function verifyCommandRegistries(): void {
	if (commandRegistriesVerified) {
		return;
	}

	for (const command of EFFECT_COMMANDS) {
		try {
			CommandRegistry.getEffect(command);
		} catch {
			throw new Error(`Missing effect command handler: ${command}`);
		}
	}

	for (const command of STREAM_COMMANDS) {
		try {
			CommandRegistry.getStream(command);
		} catch {
			throw new Error(`Missing stream command handler: ${command}`);
		}
	}

	commandRegistriesVerified = true;
}

function executeStreamStep({
	step,
	fs,
	input,
	context,
	resolvedOutputRedirectPath,
}: ExecuteStreamStepParams): Stream<ShellRecord> {
	verifyCommandRegistries();
	if (!isStreamCommand(step.cmd)) {
		throw new Error(`Command "${step.cmd}" is not a stream command`);
	}
	const handler = CommandRegistry.getStream(step.cmd);
	return handler({
		step: step as StreamStepForCommand<typeof step.cmd>,
		fs,
		input,
		context,
		resolvedOutputRedirectPath,
	});
}

async function executeEffectStep({
	step,
	fs,
	context,
}: ExecuteEffectStepParams): Promise<void> {
	verifyCommandRegistries();
	const handler = CommandRegistry.getEffect(step.cmd);
	await handler({
		step,
		fs,
		context,
	});
}

function createBuiltinRuntime(
	fs: FS,
	context: ExecuteStepContext,
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

function resolveLsPath(path: string, cwd: string): string {
	return normalizeLsPath(path, cwd);
}

export namespace CommandRegistry {
	const commands = new Map<StepIR['cmd'], CommandRegistryEntry>();

	export function register<TCommand extends StreamCommand>(
		command: TCommand,
		entry: StreamCommandEntry<TCommand>
	): void;
	export function register<TCommand extends EffectCommand>(
		command: TCommand,
		entry: EffectCommandEntry<TCommand>
	): void;
	export function register(
		command: StepIR['cmd'],
		entry: CommandRegistryEntry
	): void {
		commands.set(command, entry);
	}

	export function getStream<TCommand extends StreamCommand>(
		command: TCommand
	): StreamCommandHandler<TCommand> {
		const entry = commands.get(command);
		if (!entry) {
			throw new Error(`Unknown command: ${command}`);
		}
		if (entry.kind !== 'stream') {
			throw new Error(`Command "${command}" is not a stream command`);
		}
		return entry.handler as unknown as StreamCommandHandler<TCommand>;
	}

	export function getEffect<TCommand extends EffectCommand>(
		command: TCommand
	): EffectCommandHandler<TCommand> {
		const entry = commands.get(command);
		if (!entry) {
			throw new Error(`Unknown command: ${command}`);
		}
		if (entry.kind !== 'effect') {
			throw new Error(`Command "${command}" is not an effect command`);
		}
		return entry.handler as unknown as EffectCommandHandler<TCommand>;
	}

	export function isEffectStep(step: StepIR): step is EffectStep {
		return EFFECT_COMMAND_SET.has(step.cmd);
	}

	export function executeStep(
		params: ExecuteStreamStepParams
	): Stream<ShellRecord>;
	export function executeStep(params: ExecuteEffectStepParams): Promise<void>;
	export function executeStep(
		params: ExecuteStreamStepParams | ExecuteEffectStepParams
	): Stream<ShellRecord> | Promise<void> {
		if (isEffectStep(params.step)) {
			return executeEffectStep(params as ExecuteEffectStepParams);
		}
		return executeStreamStep(params as ExecuteStreamStepParams);
	}
}

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
			const inputPath = await resolveRedirectPath(
				step.cmd,
				step.redirections,
				'input',
				fs,
				context
			);
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
				// @shfs/compiler can be consumed as a built package in this workspace,
				// so grep args may type as legacy argv until compiler is rebuilt.
				parsed: step.args as unknown as Parameters<
					typeof runGrepCommand
				>[0]['parsed'],
				redirections: step.redirections,
				resolvedOutputRedirectPath,
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
			const inputPath = await resolveRedirectPath(
				step.cmd,
				step.redirections,
				'input',
				fs,
				context
			);
			const result = await runXargsCommand({
				context,
				fs,
				input,
				inputPath,
				parsed: step.args,
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

CommandRegistry.register('head', {
	kind: 'stream',
	handler: ({ step, fs, input, context }) => {
		return (async function* (): Stream<ShellRecord> {
			const inputPath = await resolveRedirectPath(
				step.cmd,
				step.redirections,
				'input',
				fs,
				context
			);
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
			const paths = await evaluateExpandedPathWords(
				'ls',
				step.args.paths,
				fs,
				context
			);
			for (const inputPath of paths) {
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
			const inputPath = await resolveRedirectPath(
				step.cmd,
				step.redirections,
				'input',
				fs,
				context
			);
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
			const resolvedInput = await resolveInputRedirect(
				step.cmd,
				step.redirections,
				fs,
				context
			);
			if (resolvedInput.closed) {
				context.stderr.append('read: stdin is closed');
				context.status = 1;
				return;
			}
			const redirectedInput = resolvedInput.path
				? lineRecordsFromPath(fs, resolvedInput.path)
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
	handler: async ({ step, fs, context }) => {
		await cd(createBuiltinRuntime(fs, context, null), step.args);
	},
});

CommandRegistry.register('cp', {
	kind: 'effect',
	handler: async ({ step, fs, context }) => {
		const srcPaths = resolvePathsFromCwd(
			context.cwd,
			await evaluateExpandedPathWords('cp', step.args.srcs, fs, context)
		);
		const destinationPaths = resolvePathsFromCwd(context.cwd, [
			await evaluateExpandedSinglePath(
				'cp',
				'destination must expand to exactly 1 path',
				step.args.dest,
				fs,
				context
			),
		]);
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
	},
});

CommandRegistry.register('mkdir', {
	kind: 'effect',
	handler: async ({ step, fs, context }) => {
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
	},
});

CommandRegistry.register('mv', {
	kind: 'effect',
	handler: async ({ step, fs, context }) => {
		const srcPaths = resolvePathsFromCwd(
			context.cwd,
			await evaluateExpandedPathWords('mv', step.args.srcs, fs, context)
		);
		const destinationPaths = resolvePathsFromCwd(context.cwd, [
			await evaluateExpandedSinglePath(
				'mv',
				'destination must expand to exactly 1 path',
				step.args.dest,
				fs,
				context
			),
		]);
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
	},
});

CommandRegistry.register('rm', {
	kind: 'effect',
	handler: async ({ step, fs, context }) => {
		const paths = resolvePathsFromCwd(
			context.cwd,
			await evaluateExpandedPathWords('rm', step.args.paths, fs, context)
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
	},
});

CommandRegistry.register('touch', {
	kind: 'effect',
	handler: async ({ step, fs, context }) => {
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
	},
});
