import type { SetStep } from '@shfs/compiler';
import {
	evaluateExpandedWord,
	evaluateExpandedWords,
} from '../../execute/path';
import type { Builtin } from '../types';

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const set: Builtin<SetStep['args']> = (runtime, args) => {
	return (async function* () {
		const name = await evaluateExpandedWord(
			args.name,
			runtime.fs,
			runtime.context
		);
		if (!VARIABLE_NAME_REGEX.test(name)) {
			throw new Error(`set: invalid variable name: ${name}`);
		}

		const values = await evaluateExpandedWords(
			args.values,
			runtime.fs,
			runtime.context
		);
		const value = values.join(' ');
		if (args.scope === 'global') {
			runtime.context.globalVars.set(name, value);
		} else {
			runtime.context.localVars.set(name, value);
		}
		runtime.context.status = 0;
		yield* [];
	})();
};
