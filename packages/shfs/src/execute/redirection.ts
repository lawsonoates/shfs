import {
	expandedWordToString,
	type RedirectionIR,
	type StepIR,
} from '@shfs/compiler';
import type { FS } from '../fs/fs';
import type { Record as ShellRecord } from '../record';
import type { Stream } from '../stream';
import { formatRecord } from './records';

const textEncoder = new TextEncoder();

export type ExecuteResult =
	| { kind: 'stream'; value: Stream<ShellRecord> }
	| { kind: 'sink'; value: Promise<void> };

export function getRedirectPath(
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
