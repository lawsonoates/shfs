import { isCompileError, isParseSyntaxError } from '@shfs/compiler';
import { type Effect, Stream } from 'effect';

import {
	createDiagnosticError,
	type ShellFailure,
	ShellRuntimeError,
} from '../diagnostics';
import type { Record as ShellRecord } from '../record';

export type RecordStream = Stream.Stream<ShellRecord, ShellFailure>;

export function toShellFailure(cause: unknown): ShellFailure {
	if (isParseSyntaxError(cause)) {
		return createDiagnosticError(cause.diagnostic);
	}
	if (isCompileError(cause)) {
		return createDiagnosticError(cause.diagnostic);
	}
	return new ShellRuntimeError({
		cause,
		exitCode: 1,
		message: cause instanceof Error ? cause.message : String(cause),
	});
}

export function fromRecordGenerator(
	gen: AsyncIterable<ShellRecord>
): RecordStream {
	return Stream.fromAsyncIterable(gen, toShellFailure);
}

export function collectRecordStream(
	stream: RecordStream
): Effect.Effect<ShellRecord[], ShellFailure> {
	return Stream.runCollect(stream);
}
