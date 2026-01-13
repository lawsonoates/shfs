/**
 * V2 mv command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIRV2,
} from '../../../ir';

/**
 * Compile a mv command from SimpleCommandIR to StepIRV2.
 */
export function compileMvV2(cmd: SimpleCommandIR): StepIRV2 {
	const filteredArgs: ExpandedWord[] = [];

	for (const arg of cmd.args) {
		const argStr = expandedWordToString(arg);
		if (argStr !== '-f' && argStr !== '-i') {
			filteredArgs.push(arg);
		}
	}

	if (filteredArgs.length < 2) {
		throw new Error('mv requires source and destination');
	}

	const dest = filteredArgs.pop();
	if (!dest) {
		throw new Error('mv requires source and destination');
	}
	const srcs = filteredArgs;

	return {
		cmd: 'mv',
		args: { dest, srcs },
	} as const;
}
