import { expandedWordToString, type RedirectionIR } from '@shfs/compiler';
import { Effect } from 'effect';
import type { BuiltinContext } from '../builtin/types';
import { type ShellErrorCause, ShellRuntimeError } from '../diagnostics';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import { evaluateExpandedSinglePathEffect, resolvePathFromCwd } from './path';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const FD_TARGET_REGEX = /^&[0-9]+$/;
const NULL_DEVICE_PATH = '/dev/null';

export type ExecuteResult =
	| { kind: 'stream'; value: Stream<ShellRecord> }
	| { kind: 'sink'; value: Promise<void> };

export type RedirectionMode = 'file' | 'fd' | 'close' | 'pipe';

export interface ResolvedInputRedirect {
	path: string | null;
	closed: boolean;
}

interface InputDescriptor {
	kind: 'inherit' | 'path' | 'closed';
	path?: string;
}

interface ResolvedFileRedirect {
	path: string;
	append: boolean;
	noclobber: boolean;
}

function getSourceFd(redirection: RedirectionIR): number {
	return redirection.sourceFd ?? (redirection.kind === 'input' ? 0 : 1);
}

function inferModeFromTarget(redirection: RedirectionIR): RedirectionMode {
	const targetText = expandedWordToString(redirection.target);
	if (targetText === '&-') {
		return 'close';
	}
	if (FD_TARGET_REGEX.test(targetText)) {
		return 'fd';
	}
	if (redirection.kind === 'output' && targetText === '|') {
		return 'pipe';
	}
	return 'file';
}

export function getRedirectionMode(
	redirection: RedirectionIR
): RedirectionMode {
	return redirection.mode ?? inferModeFromTarget(redirection);
}

function getTargetFd(redirection: RedirectionIR): number | null {
	if (redirection.targetFd !== undefined && redirection.targetFd !== null) {
		return redirection.targetFd;
	}
	const targetText = expandedWordToString(redirection.target);
	if (FD_TARGET_REGEX.test(targetText)) {
		return Number(targetText.slice(1));
	}
	return null;
}

function isOptionalInput(redirection: RedirectionIR): boolean {
	if (redirection.optional) {
		return true;
	}
	if (redirection.kind !== 'input') {
		return false;
	}
	const targetText = expandedWordToString(redirection.target);
	return targetText.startsWith('?');
}

function isDefaultFileRedirect(
	redirection: RedirectionIR,
	kind: RedirectionIR['kind']
): boolean {
	if (redirection.kind !== kind) {
		return false;
	}
	if (getRedirectionMode(redirection) !== 'file') {
		return false;
	}
	const sourceFd = getSourceFd(redirection);
	return sourceFd === (kind === 'input' ? 0 : 1);
}

function getLastDefaultFileRedirect(
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind']
): RedirectionIR | null {
	if (!redirections) {
		return null;
	}
	let redirect: RedirectionIR | null = null;
	for (const redirection of redirections) {
		if (isDefaultFileRedirect(redirection, kind)) {
			redirect = redirection;
		}
	}
	return redirect;
}

function resolveFileRedirectEffect(
	command: string,
	redirection: RedirectionIR,
	fs: FS,
	context: BuiltinContext
): Effect.Effect<ResolvedFileRedirect, ShellErrorCause> {
	return Effect.gen(function* () {
		const targetPath = yield* evaluateExpandedSinglePathEffect(
			command,
			'redirection target must expand to exactly 1 path',
			redirection.target,
			fs,
			context
		);
		return {
			path: resolvePathFromCwd(context.cwd, targetPath),
			append: redirection.append ?? false,
			noclobber: redirection.noclobber ?? false,
		};
	});
}

function updateDescriptor(descriptor: InputDescriptor, path: string): void {
	descriptor.kind = 'path';
	descriptor.path = path;
}

function ensureInputDescriptor(
	descriptors: Map<number, InputDescriptor>,
	fd: number
): InputDescriptor {
	const existing = descriptors.get(fd);
	if (existing) {
		return existing;
	}
	const descriptor: InputDescriptor = {
		kind: 'inherit',
	};
	descriptors.set(fd, descriptor);
	return descriptor;
}

function applyInputRedirectionEffect(params: {
	command: string;
	context: BuiltinContext;
	descriptors: Map<number, InputDescriptor>;
	fs: FS;
	redirection: RedirectionIR;
}): Effect.Effect<void, ShellErrorCause> {
	return Effect.gen(function* () {
		const { command, context, descriptors, fs, redirection } = params;
		if (redirection.kind !== 'input') {
			return;
		}

		const sourceFd = getSourceFd(redirection);
		const mode = getRedirectionMode(redirection);
		if (mode === 'close') {
			descriptors.set(sourceFd, { kind: 'closed' });
			return;
		}
		if (mode === 'fd') {
			const targetFd = getTargetFd(redirection);
			if (targetFd === null) {
				return yield* new ShellRuntimeError({
					exitCode: 1,
					message: `${command}: invalid file descriptor duplication target`,
				});
			}
			descriptors.set(
				sourceFd,
				ensureInputDescriptor(descriptors, targetFd)
			);
			return;
		}
		if (mode !== 'file') {
			return;
		}

		const resolved = yield* resolveFileRedirectEffect(
			command,
			redirection,
			fs,
			context
		);
		const optionalMissing =
			isOptionalInput(redirection) &&
			!(yield* Effect.tryPromise({
				try: () => fs.exists(resolved.path),
				catch: (cause) =>
					new ShellRuntimeError({
						cause,
						exitCode: 1,
						message:
							cause instanceof Error
								? cause.message
								: String(cause),
					}),
			}));
		if (optionalMissing) {
			return;
		}
		updateDescriptor(
			ensureInputDescriptor(descriptors, sourceFd),
			resolved.path
		);
	});
}

export function resolveInputRedirectEffect(
	command: string,
	redirections: RedirectionIR[] | undefined,
	fs: FS,
	context: BuiltinContext
): Effect.Effect<ResolvedInputRedirect, ShellErrorCause> {
	return Effect.gen(function* () {
		if (!redirections || redirections.length === 0) {
			return { path: null, closed: false };
		}

		const descriptors = new Map<number, InputDescriptor>();

		for (const redirection of redirections) {
			yield* applyInputRedirectionEffect({
				command,
				context,
				descriptors,
				fs,
				redirection,
			});
		}

		const stdinDescriptor = ensureInputDescriptor(descriptors, 0);
		return {
			path:
				stdinDescriptor.kind === 'path'
					? (stdinDescriptor.path ?? null)
					: null,
			closed: stdinDescriptor.kind === 'closed',
		};
	});
}

export function hasRedirect(
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind']
): boolean {
	return getLastDefaultFileRedirect(redirections, kind) !== null;
}

export function resolveRedirectPathEffect(
	command: string,
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind'],
	fs: FS,
	context: BuiltinContext
): Effect.Effect<string | null, ShellErrorCause> {
	return Effect.gen(function* () {
		if (kind === 'input') {
			const resolvedInput = yield* resolveInputRedirectEffect(
				command,
				redirections,
				fs,
				context
			);
			return resolvedInput.path;
		}

		const redirect = getLastDefaultFileRedirect(redirections, kind);
		if (!redirect) {
			return null;
		}
		const resolved = yield* resolveFileRedirectEffect(
			command,
			redirect,
			fs,
			context
		);
		return resolved.path;
	});
}

export function withInputRedirect(
	paths: string[],
	inputPath: string | null
): string[] {
	if (paths.length > 0 || !inputPath) {
		return paths;
	}
	return [inputPath];
}

async function readExistingFileText(fs: FS, path: string): Promise<string> {
	try {
		return textDecoder.decode(await fs.readFile(path));
	} catch {
		return '';
	}
}

export async function writeTextToFile(
	fs: FS,
	path: string,
	content: string,
	options: {
		append?: boolean;
	}
): Promise<void> {
	if (isNullDevicePath(path)) {
		return;
	}
	const append = options.append ?? false;
	if (!append) {
		await fs.writeFile(path, textEncoder.encode(content));
		return;
	}
	const existing = await readExistingFileText(fs, path);
	const separator = existing === '' || content === '' ? '' : '\n';
	await fs.writeFile(
		path,
		textEncoder.encode(`${existing}${separator}${content}`)
	);
}

export async function ensureNoclobberWritable(
	fs: FS,
	path: string
): Promise<boolean> {
	if (isNullDevicePath(path)) {
		return true;
	}
	return !(await fs.exists(path));
}

export function isNullDevicePath(path: string): boolean {
	return path === NULL_DEVICE_PATH;
}
