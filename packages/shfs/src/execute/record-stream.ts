import { isCompileError, isParseSyntaxError } from '@shfs/compiler';
import { Result } from 'better-result';

import {
	createDiagnosticError,
	type ShellFailure,
	ShellRuntimeError,
} from '../diagnostics';
import type { Record as ShellRecord } from '../record';

export type RecordStream = AsyncGenerator<
	ShellRecord,
	Result<void, ShellFailure>
>;

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
	return (async function* (): RecordStream {
		try {
			for await (const record of gen) {
				yield record;
			}
			return Result.ok();
		} catch (cause) {
			return Result.err(toShellFailure(cause));
		}
	})();
}

export function fromRecords(records: readonly ShellRecord[]): RecordStream {
	return (async function* (): RecordStream {
		for (const record of records) {
			yield record;
		}
		return Result.ok();
	})();
}

export function empty(): RecordStream {
	return fromRecords([]);
}

export async function collectRecordStream(
	stream: RecordStream
): Promise<Result<ShellRecord[], ShellFailure>> {
	const records: ShellRecord[] = [];
	while (true) {
		const next = await stream.next();
		if (next.done) {
			if (Result.isError(next.value)) {
				return Result.err(next.value.error);
			}
			return Result.ok(records);
		}
		records.push(next.value);
	}
}
