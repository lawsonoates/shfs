import type { EchoStep } from '@shfs/compiler';
import { evaluateExpandedPathWords } from '../../execute/path';
import type { Builtin } from '../types';

export const echo: Builtin<EchoStep['args']> = (runtime, args) => {
	return (async function* () {
		const values = await evaluateExpandedPathWords(
			'echo',
			args.values,
			runtime.fs,
			runtime.context
		);
		yield {
			kind: 'line',
			text: values.join(' '),
		} as const;
		runtime.context.status = 0;
	})();
};
