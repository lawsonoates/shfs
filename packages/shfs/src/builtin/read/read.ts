import type { ReadStep } from '@shfs/compiler';
import { evaluateExpandedWord } from '../../execute/path';
import { setVariable } from '../../execute/variables';
import type { Builtin, BuiltinRuntime } from '../types';

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function readFirstValue(runtime: BuiltinRuntime): Promise<string | null> {
	if (!runtime.input) {
		return null;
	}

	let firstValue: string | null = null;
	for await (const line of runtime.stdin.lines()) {
		if (firstValue === null) {
			firstValue = line;
		}
	}
	return firstValue;
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

		setVariable(runtime.context, name, [value], 'auto');
		runtime.context.status = 0;
		yield* [];
	})();
};
