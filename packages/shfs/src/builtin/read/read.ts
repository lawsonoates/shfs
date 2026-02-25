import type { ReadStep } from '@shfs/compiler';
import { evaluateExpandedWord } from '../../execute/path';
import type { Record as ShellRecord } from '../../record';
import type { Builtin, BuiltinRuntime } from '../types';

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function readFirstValue(runtime: BuiltinRuntime): Promise<string | null> {
	if (!runtime.input) {
		return null;
	}

	let firstValue: string | null = null;
	for await (const record of runtime.input) {
		const value = await recordToText(runtime, record);
		if (firstValue === null) {
			firstValue = value;
		}
	}
	return firstValue;
}

async function recordToText(
	runtime: BuiltinRuntime,
	record: ShellRecord
): Promise<string> {
	if (record.kind === 'line') {
		return record.text;
	}
	if (record.kind === 'file') {
		for await (const line of runtime.fs.readLines(record.path)) {
			return line;
		}
		return '';
	}
	return JSON.stringify(record.value);
}

export const read: Builtin<ReadStep['args']> = (runtime, args) => {
	return (async function* () {
		const name = await evaluateExpandedWord(
			args.name,
			runtime.fs,
			runtime.context
		);
		if (!VARIABLE_NAME_REGEX.test(name)) {
			throw new Error(`read: invalid variable name: ${name}`);
		}

		const value = await readFirstValue(runtime);
		if (value === null) {
			runtime.context.status = 1;
			return;
		}

		runtime.context.localVars.set(name, value);
		runtime.context.status = 0;
		yield* [];
	})();
};
