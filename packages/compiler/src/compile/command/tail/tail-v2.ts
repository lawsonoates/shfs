/**
 * V2 tail command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	type SimpleCommandIR,
	type StepIRV2,
	expandedWordToString,
} from '../../../ir';

const NEGATIVE_NUMBER_REGEX = /^-\d+$/;

/**
 * Compile a tail command from SimpleCommandIR to StepIRV2.
 */
export function compileTailV2(cmd: SimpleCommandIR): StepIRV2 {
	let n = 10; // default
	const files: ExpandedWord[] = [];

	let skipNext = false;
	for (let i = 0; i < cmd.args.length; i++) {
		if (skipNext) {
			skipNext = false;
			continue;
		}

		const arg = cmd.args[i];
		if (!arg) continue;

		const argStr = expandedWordToString(arg);

		// Handle -n N format (e.g., -n 10)
		if (argStr === '-n') {
			const numArg = cmd.args[i + 1];
			if (!numArg) {
				throw new Error('tail -n requires a number');
			}
			n = Number(expandedWordToString(numArg));
			if (!Number.isFinite(n)) {
				throw new Error('Invalid tail count');
			}
			skipNext = true;
		}
		// Handle -N format (e.g., -10)
		else if (argStr.startsWith('-') && NEGATIVE_NUMBER_REGEX.test(argStr)) {
			n = Number(argStr.slice(1));
		}
		// Everything else is a file
		else if (argStr.startsWith('-')) {
			throw new Error('Unknown tail option');
		} else {
			files.push(arg);
		}
	}

	return {
		cmd: 'tail',
		args: { files, n },
	} as const;
}
