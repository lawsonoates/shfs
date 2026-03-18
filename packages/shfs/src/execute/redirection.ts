import type { RedirectionIR, StepIR } from '@shfs/compiler';
import type { BuiltinContext } from '../builtin/types';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import { evaluateExpandedSinglePath, resolvePathFromCwd } from './path';
import { formatRecord } from './records';

const textEncoder = new TextEncoder();

export type ExecuteResult =
	| { kind: 'stream'; value: Stream<ShellRecord> }
	| { kind: 'sink'; value: Promise<void> };

function getRedirect(
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind']
): RedirectionIR | null {
	if (!redirections) {
		return null;
	}

	let redirect: RedirectionIR | null = null;
	for (const redirection of redirections) {
		if (redirection.kind === kind) {
			redirect = redirection;
		}
	}
	return redirect;
}

export function hasRedirect(
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind']
): boolean {
	return getRedirect(redirections, kind) !== null;
}

export async function resolveRedirectPath(
	command: string,
	redirections: RedirectionIR[] | undefined,
	kind: RedirectionIR['kind'],
	fs: FS,
	context: BuiltinContext
): Promise<string | null> {
	const redirect = getRedirect(redirections, kind);
	if (!redirect) {
		return null;
	}

	const targetPath = await evaluateExpandedSinglePath(
		command,
		'redirection target must expand to exactly 1 path',
		redirect.target,
		fs,
		context
	);
	return resolvePathFromCwd(context.cwd, targetPath);
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

export function applyOutputRedirect(
	result: ExecuteResult,
	step: StepIR,
	fs: FS,
	context: BuiltinContext
): ExecuteResult {
	if (!hasRedirect(step.redirections, 'output')) {
		return result;
	}

	if (result.kind === 'stream') {
		return {
			kind: 'sink',
			value: (async () => {
				const outputPath = await resolveRedirectPath(
					step.cmd,
					step.redirections,
					'output',
					fs,
					context
				);
				if (!outputPath) {
					throw new Error(
						`${step.cmd}: output redirection missing target`
					);
				}
				await writeStreamToFile(result.value, outputPath, fs);
			})(),
		};
	}

	return {
		kind: 'sink',
		value: (async () => {
			const outputPath = await resolveRedirectPath(
				step.cmd,
				step.redirections,
				'output',
				fs,
				context
			);
			if (!outputPath) {
				throw new Error(
					`${step.cmd}: output redirection missing target`
				);
			}
			await result.value;
			await fs.writeFile(outputPath, textEncoder.encode(''));
		})(),
	};
}

export async function writeStreamToFile(
	stream: Stream<ShellRecord>,
	path: string,
	fs: FS
): Promise<void> {
	const outputChunks: string[] = [];
	for await (const record of stream) {
		outputChunks.push(formatRecord(record));
	}
	await fs.writeFile(path, textEncoder.encode(outputChunks.join('\n')));
}
