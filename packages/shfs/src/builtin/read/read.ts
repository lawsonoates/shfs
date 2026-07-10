import type { ReadStep } from '@shfs/compiler';
import { evaluateExpandedWord } from '../../execute/path';
import { setVariable } from '../../execute/variables';
import type { Builtin } from '../types';

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

		const value = await runtime.stdin.readLine();
		if (value === null) {
			runtime.context.status = 1;
			return;
		}

		setVariable(runtime.context, name, [value], 'auto');
		runtime.context.status = 0;
		yield* [];
	})();
};
