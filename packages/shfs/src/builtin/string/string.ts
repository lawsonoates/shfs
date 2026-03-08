import type { StringStep } from '@shfs/compiler';
import picomatch from 'picomatch';
import {
	evaluateExpandedWord,
	evaluateExpandedWords,
} from '../../execute/path';
import type { Builtin, BuiltinRuntime } from '../types';

function replace(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		if (operands[0]?.startsWith('-')) {
			throw new Error(`string replace: unsupported flag: ${operands[0]}`);
		}

		if (operands.length < 3) {
			throw new Error('string replace requires pattern replacement text');
		}
		const pattern = operands.at(0);
		const replacement = operands.at(1);
		const inputs = operands.slice(2);
		if (pattern === undefined || replacement === undefined) {
			throw new Error('string replace requires pattern replacement text');
		}
		if (inputs.length === 0) {
			runtime.context.status = 1;
			return;
		}

		for (const input of inputs) {
			yield {
				kind: 'line',
				text: input.replaceAll(pattern, replacement),
			} as const;
		}
		runtime.context.status = 0;
	})();
}

function match(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		let quiet = false;
		let offset = 0;

		while (operands[offset]?.startsWith('-')) {
			const flag = operands[offset];
			if (flag === '-q' && !quiet) {
				quiet = true;
				offset += 1;
				continue;
			}

			throw new Error(`string match: unsupported flag: ${flag}`);
		}

		const filtered = operands.slice(offset);
		const [pattern, value] = filtered;
		if (!(pattern && value !== undefined)) {
			throw new Error('string match requires pattern and value');
		}
		if (filtered.length > 2) {
			throw new Error('string match: unsupported arguments');
		}

		const isMatch = picomatch(pattern, { dot: true })(value);
		runtime.context.status = isMatch ? 0 : 1;
		if (isMatch && !quiet) {
			yield { kind: 'line', text: value } as const;
		}
	})();
}

export const string: Builtin<StringStep['args']> = (runtime, args) => {
	return (async function* () {
		const subcommand = await evaluateExpandedWord(
			args.subcommand,
			runtime.fs,
			runtime.context
		);
		const operands = await evaluateExpandedWords(
			args.operands,
			runtime.fs,
			runtime.context
		);

		if (subcommand === 'replace') {
			yield* replace(runtime, operands);
			return;
		}
		if (subcommand === 'match') {
			yield* match(runtime, operands);
			return;
		}

		throw new Error(`string: unsupported subcommand: ${subcommand}`);
	})();
};
