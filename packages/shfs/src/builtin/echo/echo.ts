import type { EchoStep } from '@shfs/compiler';
import { runOrReport } from '../../diagnostics';
import { evaluateExpandedPathWordsEffect } from '../../execute/path';
import type { Builtin } from '../types';

export const echo: Builtin<EchoStep['args']> = (runtime, args) => {
	return (async function* () {
		const values = await runOrReport(
			evaluateExpandedPathWordsEffect(
				'echo',
				args.values,
				runtime.fs,
				runtime.context
			),
			runtime.context
		);
		if (!values.ok) {
			return;
		}
		yield {
			kind: 'line',
			text: values.value.join(' '),
		} as const;
		runtime.context.status = 0;
	})();
};
