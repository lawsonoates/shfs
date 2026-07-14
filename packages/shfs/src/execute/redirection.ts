import { expandedWordToString, type RedirectionIR } from '@shfs/compiler';
import { Result } from 'better-result';
import type { BuiltinContext } from '../builtin/types';
import {
	type ShellErrorCause,
	type ShellResult,
	ShellRuntimeError,
} from '../diagnostics';
import type { FS } from '../fs/fs';
import { evaluateExpandedSinglePathEffect, resolvePathFromCwd } from './path';

const textEncoder = new TextEncoder();
const FD_TARGET_REGEX = /^&[0-9]+$/;
const NULL_DEVICE_PATH = '/dev/null';

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
): ShellResult<ResolvedFileRedirect, ShellErrorCause> {
	return Result.gen(async function* () {
		const targetPath = yield* await evaluateExpandedSinglePathEffect(
			command,
			'redirection target must expand to exactly 1 path',
			redirection.target,
			fs,
			context
		);
		return Result.ok({
			path: resolvePathFromCwd(context.cwd, targetPath),
			append: redirection.append ?? false,
			noclobber: redirection.noclobber ?? false,
		});
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
}): ShellResult<void, ShellErrorCause> {
	return Result.gen(async function* () {
		const { command, context, descriptors, fs, redirection } = params;
		if (redirection.kind !== 'input') {
			return Result.ok();
		}

		const sourceFd = getSourceFd(redirection);
		const mode = getRedirectionMode(redirection);
		if (mode === 'close') {
			descriptors.set(sourceFd, { kind: 'closed' });
			return Result.ok();
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
			return Result.ok();
		}
		if (mode !== 'file') {
			return Result.ok();
		}

		const resolved = yield* await resolveFileRedirectEffect(
			command,
			redirection,
			fs,
			context
		);
		const optionalMissing =
			isOptionalInput(redirection) &&
			!(yield* await Result.tryPromise({
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
			return Result.ok();
		}
		updateDescriptor(
			ensureInputDescriptor(descriptors, sourceFd),
			resolved.path
		);
		return Result.ok();
	});
}

export function resolveInputRedirectEffect(
	command: string,
	redirections: RedirectionIR[] | undefined,
	fs: FS,
	context: BuiltinContext
): ShellResult<ResolvedInputRedirect, ShellErrorCause> {
	return Result.gen(async function* () {
		if (!redirections || redirections.length === 0) {
			return Result.ok({ path: null, closed: false });
		}

		const descriptors = new Map<number, InputDescriptor>();

		for (const redirection of redirections) {
			yield* await applyInputRedirectionEffect({
				command,
				context,
				descriptors,
				fs,
				redirection,
			});
		}

		const stdinDescriptor = ensureInputDescriptor(descriptors, 0);
		return Result.ok({
			path:
				stdinDescriptor.kind === 'path'
					? (stdinDescriptor.path ?? null)
					: null,
			closed: stdinDescriptor.kind === 'closed',
		});
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
): ShellResult<string | null, ShellErrorCause> {
	return Result.gen(async function* () {
		if (kind === 'input') {
			const resolvedInput = yield* await resolveInputRedirectEffect(
				command,
				redirections,
				fs,
				context
			);
			return Result.ok(resolvedInput.path);
		}

		const redirect = getLastDefaultFileRedirect(redirections, kind);
		if (!redirect) {
			return Result.ok(null);
		}
		const resolved = yield* await resolveFileRedirectEffect(
			command,
			redirect,
			fs,
			context
		);
		return Result.ok(resolved.path);
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

async function readExistingFileBytes(
	fs: FS,
	path: string
): Promise<Uint8Array> {
	try {
		return await fs.readFile(path);
	} catch {
		return new Uint8Array();
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
	const existing = await readExistingFileBytes(fs, path);
	const appended = textEncoder.encode(content);
	const combined = new Uint8Array(existing.length + appended.length);
	combined.set(existing);
	combined.set(appended, existing.length);
	await fs.writeFile(path, combined);
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
