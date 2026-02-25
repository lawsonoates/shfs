import type { TestStep } from '@shfs/compiler';
import { evaluateExpandedWords } from '../../execute/path';
import type { Builtin } from '../types';

function evaluateStatus(operands: string[]): 0 | 1 {
	if (operands.length === 1) {
		return operands[0] === '' ? 1 : 0;
	}

	if (operands.length === 3) {
		const [left, operator, right] = operands;
		if (operator === '=') {
			return left === right ? 0 : 1;
		}
		if (operator === '!=') {
			return left !== right ? 0 : 1;
		}
	}

	throw new Error('test: unsupported arguments');
}

export const test: Builtin<TestStep['args']> = (runtime, args) => {
	return (async function* () {
		const operands = await evaluateExpandedWords(
			args.operands,
			runtime.fs,
			runtime.context
		);
		runtime.context.status = evaluateStatus(operands);
		yield* [];
	})();
};
