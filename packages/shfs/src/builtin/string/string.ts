import type { StringStep } from '@shfs/compiler';
import picomatch from 'picomatch';
import {
	evaluateExpandedWord,
	evaluateExpandedWords,
} from '../../execute/path';
import type { Builtin, BuiltinRuntime } from '../types';

interface MatchInvocation {
	pattern: string;
	quiet: boolean;
	values: string[];
}

async function collectStdinLines(runtime: BuiltinRuntime): Promise<string[]> {
	if (!runtime.input) {
		return [];
	}
	const lines: string[] = [];
	for await (const line of runtime.stdin.lines()) {
		lines.push(line);
	}
	return lines;
}

function replace(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		if (operands[0]?.startsWith('-')) {
			throw new Error(`string replace: unsupported flag: ${operands[0]}`);
		}

		if (operands.length < 2) {
			throw new Error('string replace requires pattern replacement text');
		}
		const pattern = operands.at(0);
		const replacement = operands.at(1);
		if (pattern === undefined || replacement === undefined) {
			throw new Error('string replace requires pattern replacement text');
		}
		if (operands.length === 2 && !runtime.input) {
			throw new Error('string replace requires pattern replacement text');
		}
		const inputs =
			operands.length > 2
				? operands.slice(2)
				: await collectStdinLines(runtime);
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

async function parseMatchInvocation(
	runtime: BuiltinRuntime,
	operands: string[]
): Promise<MatchInvocation> {
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
	const [pattern] = filtered;
	if (!pattern) {
		throw new Error('string match requires pattern and value');
	}
	if (filtered.length > 2) {
		throw new Error('string match: unsupported arguments');
	}
	if (filtered.length === 1 && !runtime.input) {
		throw new Error('string match requires pattern and value');
	}

	const values =
		filtered.length > 1
			? filtered.slice(1)
			: await collectStdinLines(runtime);

	return { pattern, quiet, values };
}

function match(runtime: BuiltinRuntime, operands: string[]) {
	return (async function* () {
		const { pattern, quiet, values } = await parseMatchInvocation(
			runtime,
			operands
		);
		const matcher = picomatch(pattern, { dot: true });
		let matched = false;
		for (const value of values) {
			if (!matcher(value)) {
				continue;
			}
			matched = true;
			if (!quiet) {
				yield { kind: 'line', text: value } as const;
			}
		}
		runtime.context.status = matched ? 0 : 1;
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
