/**
 * V2 cp command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	type SimpleCommandIR,
	type StepIRV2,
	expandedWordToString,
	literal,
} from '../../../ir';

/**
 * Compile a cp command from SimpleCommandIR to StepIRV2.
 */
export function compileCpV2(cmd: SimpleCommandIR): StepIRV2 {
	let recursive = false;
	const filteredArgs: ExpandedWord[] = [];

	for (const arg of cmd.args) {
		const argStr = expandedWordToString(arg);
		if (argStr === '-r') {
			recursive = true;
		} else if (argStr !== '-f' && argStr !== '-i') {
			filteredArgs.push(arg);
		}
	}

	if (filteredArgs.length < 2) {
		throw new Error('cp requires source and destination');
	}

	const dest = filteredArgs.pop();
	if (!dest) {
		throw new Error('cp requires source and destination');
	}
	const srcs = filteredArgs;

	return {
		cmd: 'cp',
		args: { dest, recursive, srcs },
	} as const;
}
