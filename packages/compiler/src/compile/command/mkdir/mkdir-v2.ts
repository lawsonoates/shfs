/**
 * V2 mkdir command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIRV2,
} from '../../../ir';

/**
 * Compile a mkdir command from SimpleCommandIR to StepIRV2.
 */
export function compileMkdirV2(cmd: SimpleCommandIR): StepIRV2 {
	let recursive = false;
	const paths: ExpandedWord[] = [];

	for (const arg of cmd.args) {
		const argStr = expandedWordToString(arg);
		if (argStr === '-p') {
			recursive = true;
		} else {
			paths.push(arg);
		}
	}

	if (paths.length === 0) {
		throw new Error('mkdir requires at least one path');
	}

	return {
		cmd: 'mkdir',
		args: { paths, recursive },
	} as const;
}
